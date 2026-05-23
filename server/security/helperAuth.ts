import type { NextFunction, Request, Response } from 'express'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { serverConfig } from '../config.js'

type RequestWithRawBody = Request & { rawBody?: string }

export const HELPER_ID_HEADER = 'X-DCR-Helper-Id'
export const HELPER_TIMESTAMP_HEADER = 'X-DCR-Timestamp'
export const HELPER_SIGNATURE_HEADER = 'X-DCR-Signature'

export function captureRawBody(request: IncomingMessage, _response: ServerResponse, buffer: Buffer): void {
  ;(request as IncomingMessage & { rawBody?: string }).rawBody = buffer.toString('utf8')
}

export function signCentralRequest(method: string, url: URL, body = ''): Record<string, string> {
  if (!serverConfig.helperSharedSecret) return {}

  const timestamp = new Date().toISOString()
  const pathWithQuery = `${url.pathname}${url.search}`
  const signature = createSignature(serverConfig.helperSharedSecret, timestamp, method, pathWithQuery, body)

  return {
    'X-DCR-Helper-Id': serverConfig.nodeId,
    'X-DCR-Timestamp': timestamp,
    'X-DCR-Signature': signature
  }
}

export function verifyHelperSignature(request: Request, response: Response, next: NextFunction): void {
  if (serverConfig.nodeRole !== 'central') {
    next()
    return
  }

  if (!serverConfig.helperSharedSecret) {
    response.status(401).json({
      error: 'Helper sync signing is not configured on the central server',
      code: 'helper_signature_not_configured'
    })
    return
  }

  const helperId = String(request.header(HELPER_ID_HEADER) ?? '')
  const timestamp = String(request.header(HELPER_TIMESTAMP_HEADER) ?? '')
  const signature = String(request.header(HELPER_SIGNATURE_HEADER) ?? '')

  if (!helperId || !serverConfig.trustedHelperIds.includes(helperId)) {
    response.status(401).json({ error: 'The helper id is missing or not trusted', code: 'unknown_helper' })
    return
  }

  if (!timestamp || !signature) {
    response.status(401).json({ error: 'Missing helper signature headers', code: 'missing_helper_signature' })
    return
  }

  const timestampMs = Date.parse(timestamp)
  if (!Number.isFinite(timestampMs)) {
    response.status(401).json({ error: 'Invalid helper signature timestamp', code: 'invalid_helper_timestamp' })
    return
  }

  const ageSeconds = Math.abs(Date.now() - timestampMs) / 1000
  if (ageSeconds > serverConfig.helperSignatureToleranceSeconds) {
    response.status(401).json({ error: 'Stale helper signature timestamp', code: 'stale_helper_signature' })
    return
  }

  const rawBody = (request as RequestWithRawBody).rawBody ?? ''
  const expected = createSignature(
    serverConfig.helperSharedSecret,
    timestamp,
    request.method.toUpperCase(),
    request.originalUrl,
    rawBody
  )

  if (!safeEquals(expected, signature)) {
    response.status(401).json({ error: 'Invalid helper signature', code: 'invalid_helper_signature' })
    return
  }

  next()
}

function createSignature(secret: string, timestamp: string, method: string, pathWithQuery: string, body: string): string {
  return createHmac('sha256', secret)
    .update([timestamp, method.toUpperCase(), pathWithQuery, body].join('\n'))
    .digest('hex')
}

function safeEquals(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'hex')
  const actualBuffer = Buffer.from(actual, 'hex')
  if (expectedBuffer.length !== actualBuffer.length) return false
  return timingSafeEqual(expectedBuffer, actualBuffer)
}
