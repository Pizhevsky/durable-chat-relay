import type { Express } from 'express'
import type { ChatEvent } from '../../shared/types.js'
import { publicConfig, serverConfig } from '../config.js'
import type { ChatEventService } from '../services/ChatEventService.js'

export function registerClientRoutes(app: Express, service: ChatEventService): void {
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
}
