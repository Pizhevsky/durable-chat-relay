import type { NextFunction, Request, Response } from 'express'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { serverConfig } from '../config.js'
import {
  HELPER_ID_HEADER,
  HELPER_SIGNATURE_HEADER,
  HELPER_TIMESTAMP_HEADER,
  HelperSignatureService
} from './HelperSignatureService.js'

export { HELPER_ID_HEADER, HELPER_SIGNATURE_HEADER, HELPER_TIMESTAMP_HEADER }

type RequestWithRawBody = Request & { rawBody?: string }

type IncomingMessageWithRawBody = IncomingMessage & { rawBody?: string }

export function captureRawBody(request: IncomingMessage, _response: ServerResponse, buffer: Buffer): void {
  const rawRequest = request as IncomingMessageWithRawBody
  rawRequest.rawBody = buffer.toString('utf8')
}

export function signCentralRequest(method: string, url: URL, body = ''): Record<string, string> {
  return configuredHelperSignatureService().sign(method, url, body)
}

export function verifyHelperSignature(request: Request, response: Response, next: NextFunction): void {
  configuredHelperSignatureService().middleware()(request as RequestWithRawBody, response, next)
}

function configuredHelperSignatureService(): HelperSignatureService {
  return new HelperSignatureService({
    helperId: serverConfig.nodeId,
    sharedSecret: serverConfig.helperSharedSecret,
    trustedHelperIds: serverConfig.trustedHelperIds,
    toleranceSeconds: serverConfig.helperSignatureToleranceSeconds,
    centralMode: serverConfig.nodeRole === 'central'
  })
}
