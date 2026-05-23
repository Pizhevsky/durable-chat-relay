import type { Express } from 'express'
import type { SyncRequest } from '../../shared/types.js'
import { serverConfig } from '../config.js'
import { verifyHelperSignature } from '../security/helperAuth.js'
import type { ChatEventService } from '../services/ChatEventService.js'

export function registerSyncRoutes(app: Express, service: ChatEventService): void {
  app.post('/api/sync/events', verifyHelperSignature, (request, response) => {
    const body = request.body as SyncRequest
    const result = service.applyEvents(body.events ?? [])
    response.json({
      ...result,
      nodeRole: serverConfig.nodeRole,
      nodeId: serverConfig.nodeId,
      centralNodeId: serverConfig.nodeRole === 'central' ? serverConfig.nodeId : undefined
    })
  })

  app.get('/api/sync/events', verifyHelperSignature, (request, response) => {
    const since = Number(request.query.since ?? 0)
    const requestedLimit = Number(request.query.limit ?? serverConfig.helperSyncBatchSize)
    const limit = Math.max(
      1,
      Math.min(500, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : serverConfig.helperSyncBatchSize)
    )
    const events = service.getEventsSince(since, limit)
    const latestSequence = events.length > 0
      ? service.getEventSequence(events[events.length - 1].eventId)
      : since
    const currentSequence = service.getCurrentSequence()

    response.json({
      nodeRole: serverConfig.nodeRole,
      nodeId: serverConfig.nodeId,
      centralNodeId: serverConfig.nodeRole === 'central' ? serverConfig.nodeId : undefined,
      latestSequence,
      currentSequence,
      hasMore: latestSequence < currentSequence,
      events
    })
  })
}
