import Database from 'better-sqlite3'
import { createServer, type Server as HttpServer } from 'node:http'
import type { Socket as ClientSocket } from 'socket.io-client'
import { initialiseSchema, seedDemoUsers } from '../../server/db/schema'
import { ChatEventService } from '../../server/services/ChatEventService'
import { serverConfig } from '../../server/config'
import type { ChatEvent, ChatId, NodeRole, UserId } from '../../shared/types'
import {
  chatCreatedEvent,
  messageCreatedEvent
} from '../helpers/chatEvents'

export const originalConfig = { ...serverConfig }

export function createService(role: NodeRole = 'central'): {
  db: Database.Database
  service: ChatEventService
} {
  const db = new Database(':memory:')
  initialiseSchema(db)
  seedDemoUsers(db)
  return { db, service: new ChatEventService(db, role) }
}

export function chatCreated(overrides: Partial<ChatEvent> = {}): ChatEvent {
  const chatId = overrides.chatId ?? 'chat-denis-anna'
  const actorUserId = overrides.actorUserId ?? 'u-denis'
  const memberIds = (
    (overrides.payload as { memberIds?: UserId[] } | undefined)?.memberIds ??
    ['u-denis', 'u-anna']
  )

  return chatCreatedEvent({
    eventId: `device-test:${crypto.randomUUID()}`,
    originNodeId: 'browser-test',
    originDeviceId: 'device-test',
    actorUserId,
    chatId,
    payload: {
      chatId,
      clientChatId: chatId,
      type: 'direct',
      memberIds
    },
    ...overrides
  }) as ChatEvent
}

export function messageCreated(
  chatId: ChatId,
  text = 'Hello from integration test'
): ChatEvent {
  return messageCreatedEvent({
    eventId: `device-test:${crypto.randomUUID()}`,
    originNodeId: 'browser-test',
    originDeviceId: 'device-test',
    actorUserId: 'u-denis',
    chatId,
    payload: {
      messageId: `msg-${crypto.randomUUID()}`,
      clientMessageId: `msg-${crypto.randomUUID()}`,
      chatId,
      text
    }
  }) as ChatEvent
}

export function waitForSocketEvent<T>(
  socket: ClientSocket,
  eventName: string
): Promise<T> {
  return new Promise((resolveValue) => socket.once(eventName, resolveValue))
}

export async function publish(
  socket: ClientSocket,
  event: ChatEvent
): Promise<ChatEvent> {
  return new Promise((resolveValue, reject) => {
    socket.emit(
      'event:publish',
      event,
      (response: { ok: boolean; event?: ChatEvent; error?: string }) => {
        if (response.ok && response.event) resolveValue(response.event)
        else reject(new Error(response.error ?? 'Socket publish failed'))
      }
    )
  })
}

export function listen(server: HttpServer): Promise<number> {
  return new Promise((resolveValue) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address !== 'string') resolveValue(address.port)
    })
  })
}

export function closeServer(server: HttpServer): Promise<void> {
  return new Promise((resolveValue, reject) => {
    if (!server.listening) {
      resolveValue()
      return
    }
    server.close((error) => error ? reject(error) : resolveValue())
  })
}

export function restoreConfig(): void {
  Object.assign(serverConfig, originalConfig)
}
