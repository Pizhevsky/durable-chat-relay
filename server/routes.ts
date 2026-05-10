import type { Express, Request, Response, NextFunction } from 'express'
import { resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import type { ChatEvent, RecoveryDump, SyncRequest } from '../shared/types.js'
import { publicConfig, serverConfig } from './config.js'
import { toHttpError } from './errors.js'
import type { ChatEventService } from './services/ChatEventService.js'

export function registerRoutes(app: Express, service: ChatEventService): void {
  app.get('/api/config', (_request, response) => {
    response.json(publicConfig())
  })

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      nodeRole: serverConfig.nodeRole,
      nodeId: serverConfig.nodeId,
      centralUrl: serverConfig.centralUrl ?? null
    })
  })

  app.get('/api/users', (_request, response) => {
    response.json(service.listUsers())
  })

  app.get('/api/chats', (request, response) => {
    const userId = String(request.query.userId ?? '')
    response.json(service.listChats(userId))
  })

  app.get('/api/chats/:chatId/messages', (request, response) => {
    const userId = String(request.query.userId ?? '')
    response.json(service.listMessages(request.params.chatId, userId))
  })

  app.post('/api/events', (request, response) => {
    const event = request.body as ChatEvent
    const userId = String(request.header('x-demo-user-id') ?? '')

    if (!userId) {
      response.status(401).json({ error: 'Missing x-demo-user-id header for demo-auth event publishing' })
      return
    }

    const trustedEvent: ChatEvent = {
      ...event,
      actorUserId: userId
    }

    const result = service.applyEvent(trustedEvent)
    response.status(result.inserted ? 201 : 200).json(result.event)
  })

  app.post('/api/sync/events', (request, response) => {
    const body = request.body as SyncRequest
    const result = service.applyEvents(body.events ?? [])
    response.json({
      ...result,
      nodeRole: serverConfig.nodeRole,
      nodeId: serverConfig.nodeId
    })
  })

  app.get('/api/sync/events', (request, response) => {
    const since = Number(request.query.since ?? 0)
    response.json({
      nodeRole: serverConfig.nodeRole,
      nodeId: serverConfig.nodeId,
      latestSequence: service.getCurrentSequence(),
      events: service.getEventsSince(since)
    })
  })

  app.get('/api/recovery/export', (request, response) => {
    const userId = String(request.query.userId ?? 'unknown')
    const deviceId = String(request.query.deviceId ?? 'server-export')
    const dump: RecoveryDump = {
      format: 'resilient-field-chat-recovery-v1',
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
      deviceId,
      events: service.exportEvents(),
      note: 'Server-side recovery export. Browser IndexedDB exports are available from the client UI.'
    }
    response.setHeader('Content-Disposition', `attachment; filename="chat-recovery-${serverConfig.nodeId}.json"`)
    response.json(dump)
  })

  app.post('/api/recovery/import', (request, response) => {
    const dump = request.body as RecoveryDump
    if (dump.format !== 'resilient-field-chat-recovery-v1') {
      response.status(422).json({ error: 'Unsupported recovery dump format' })
      return
    }

    const result = service.applyEvents(dump.events)
    response.json(result)
  })

  app.get('/worker.js', (_request, response) => {
    const builtWorker = resolve(process.cwd(), 'dist/client/worker.js')
    const sourceWorker = resolve(process.cwd(), 'client/worker.js')
    const workerPath = existsSync(builtWorker) ? builtWorker : sourceWorker
    const worker = readFileSync(workerPath, 'utf8')
    response.type('text/javascript').send(worker)
  })

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const httpError = toHttpError(error)
    response.status(httpError.statusCode).json(httpError)
  })
}
