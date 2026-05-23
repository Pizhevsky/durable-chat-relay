import type { NextFunction, Request, Response } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'

export const HELPER_ID_HEADER = 'X-DCR-Helper-Id'
export const HELPER_TIMESTAMP_HEADER = 'X-DCR-Timestamp'
export const HELPER_SIGNATURE_HEADER = 'X-DCR-Signature'

export type HelperSignatureConfig = {
  helperId: string
  sharedSecret: string
  trustedHelperIds: string[]
  toleranceSeconds: number
  centralMode: boolean
}

export type HelperSignatureVerificationResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string }

export class HelperSignatureService {
  constructor(private readonly config: HelperSignatureConfig) {}

  sign(method: string, url: URL, body = ''): Record<string, string> {
    if (!this.config.sharedSecret) return {}

    const timestamp = new Date().toISOString()
    const signature = this.createSignature(timestamp, method, this.pathWithQuery(url), body)

    return {
      [HELPER_ID_HEADER]: this.config.helperId,
      [HELPER_TIMESTAMP_HEADER]: timestamp,
      [HELPER_SIGNATURE_HEADER]: signature
    }
  }

  verify(request: Request, rawBody = ''): HelperSignatureVerificationResult {
    if (!this.config.centralMode) return { ok: true }

    if (!this.config.sharedSecret) {
      return this.rejected('helper_signature_not_configured', 'Helper sync signing is not configured on the central server.')
    }

    const helperId = String(request.header(HELPER_ID_HEADER) ?? '')
    const timestamp = String(request.header(HELPER_TIMESTAMP_HEADER) ?? '')
    const signature = String(request.header(HELPER_SIGNATURE_HEADER) ?? '')

    if (!helperId || !this.config.trustedHelperIds.includes(helperId)) {
      return this.rejected('unknown_helper', 'The helper id is missing or not trusted')
    }

    if (!timestamp || !signature) {
      return this.rejected('missing_helper_signature', 'Missing helper signature headers')
    }

    const timestampMs = Date.parse(timestamp)
    if (!Number.isFinite(timestampMs)) {
      return this.rejected('invalid_helper_timestamp', 'Invalid helper signature timestamp')
    }

    const ageSeconds = Math.abs(Date.now() - timestampMs) / 1000
    if (ageSeconds > this.config.toleranceSeconds) {
      return this.rejected('stale_helper_signature', 'Stale helper signature timestamp')
    }

    const expected = this.createSignature(
      timestamp,
      request.method.toUpperCase(),
      request.originalUrl,
      rawBody
    )

    if (!this.safeEquals(expected, signature)) {
      return this.rejected('invalid_helper_signature', 'Invalid helper signature')
    }

    return { ok: true }
  }

  middleware() {
    return (request: Request & { rawBody?: string }, response: Response, next: NextFunction): void => {
      const result = this.verify(request, request.rawBody ?? '')
      if (result.ok) {
        next()
        return
      }

      response.status(result.status).json({ error: result.message, code: result.code })
    }
  }

  private pathWithQuery(url: URL): string {
    return `${url.pathname}${url.search}`
  }

  private createSignature(timestamp: string, method: string, pathWithQuery: string, body: string): string {
    return createHmac('sha256', this.config.sharedSecret)
      .update([timestamp, method.toUpperCase(), pathWithQuery, body].join('\n'))
      .digest('hex')
  }

  private safeEquals(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'hex')
    const actualBuffer = Buffer.from(actual, 'hex')
    if (expectedBuffer.length !== actualBuffer.length) return false
    return timingSafeEqual(expectedBuffer, actualBuffer)
  }

  private rejected(code: string, message: string): HelperSignatureVerificationResult {
    return { ok: false, status: 401, code, message }
  }
}
