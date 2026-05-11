import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { initialiseSchema, seedDemoUsers } from '../../server/db/schema'
import { ChatEventService } from '../../server/services/ChatEventService'
import type { ChatEvent } from '../../shared/types'
import { chatCreatedEvent, messageCreatedEvent } from '../helpers/chatEvents'

function createService(role: 'central' | 'helper' = 'central') {
  const db = new Database(':memory:')
  initialiseSchema(db)
  seedDemoUsers(db)
  return new ChatEventService(db, role)
}

function baseEvent(overrides: Partial<ChatEvent> = {}): ChatEvent {
  const base = chatCreatedEvent({
    eventId: `device-a:${crypto.randomUUID()}`,
    originNodeId: 'browser-a',
    originDeviceId: 'device-a',
    actorUserId: 'u-denis',
    chatId: 'chat-1',
    payload: {
      chatId: 'chat-1',
      clientChatId: 'chat-1',
      type: 'direct',
      memberIds: ['u-denis', 'u-anna']
    }
  }) as ChatEvent

  return { ...base, ...overrides }
}

describe('ChatEventService', () => {
  it('applies chat.created idempotently', () => {
    const service = createService()
    const event = baseEvent()

    expect(service.applyEvent(event).inserted).toBe(true)
    expect(service.applyEvent(event).inserted).toBe(false)
    expect(service.listChats('u-denis')).toHaveLength(1)
  })

  it('prevents duplicate direct chats with a canonical pair key', () => {
    const service = createService()
    service.applyEvent(baseEvent())

    expect(service.listChats('u-denis')[0].directPairKey).toBe('u-anna:u-denis')
    const duplicateResult = service.applyEvent(baseEvent({
      eventId: 'device-b:duplicate-direct',
      originDeviceId: 'device-b',
      actorUserId: 'u-anna',
      chatId: 'chat-duplicate',
      payload: {
        chatId: 'chat-duplicate',
        clientChatId: 'chat-duplicate',
        type: 'direct',
        memberIds: ['u-anna', 'u-denis']
      }
    }))

    expect(duplicateResult.inserted).toBe(false)
    expect(duplicateResult.event.chatId).toBe('chat-1')
    expect(service.listChats('u-denis')).toHaveLength(1)
  })

  it('knows whether two users share an active chat for peer signaling', () => {
    const service = createService()
    service.applyEvent(baseEvent())

    expect(service.usersShareActiveChat('u-denis', 'u-anna')).toBe(true)
    expect(service.usersShareActiveChat('u-denis', 'u-mark')).toBe(false)
    expect(service.usersShareActiveChat('u-denis', 'u-denis')).toBe(false)
  })

  it('stores message events and tracks sender read state', () => {
    const service = createService()
    service.applyEvent(baseEvent())

    service.applyEvent(messageCreatedEvent({
      eventId: 'device-a:message-1',
      originNodeId: 'browser-a',
      originDeviceId: 'device-a',
      actorUserId: 'u-denis',
      chatId: 'chat-1',
      payload: {
        messageId: 'msg-1',
        clientMessageId: 'msg-1',
        chatId: 'chat-1',
        text: 'Hello from the field office'
      },
    }))

    const messages = service.listMessages('chat-1', 'u-denis')
    expect(messages).toHaveLength(1)
    expect(messages[0].readBy).toContain('u-denis')
    expect(service.listChats('u-anna')[0].unreadCount).toBe(1)
  })

  it('deduplicates a peer-relayed message when the original sender reconnects', () => {
    const service = createService()
    service.applyEvent(baseEvent())
    const denisLocalMessage = messageCreatedEvent({
      eventId: 'device-denis:message-peer-relayed',
      originDeviceId: 'device-denis',
      actorUserId: 'u-denis',
      chatId: 'chat-1',
      payload: {
        messageId: 'msg-peer-relayed',
        clientMessageId: 'msg-peer-relayed',
        chatId: 'chat-1',
        text: 'Sent while Denis was local-only'
      },
      syncStatus: 'peer-replicated'
    })

    const relayedByAnna = service.applyEvents([denisLocalMessage])
    const laterFromDenis = service.applyEvent(denisLocalMessage)
    const messagesForAnna = service.listMessages('chat-1', 'u-anna')

    expect(relayedByAnna.accepted).toEqual([denisLocalMessage.eventId])
    expect(laterFromDenis.inserted).toBe(false)
    expect(messagesForAnna).toHaveLength(1)
    expect(messagesForAnna[0]).toEqual(expect.objectContaining({
      id: 'msg-peer-relayed',
      senderId: 'u-denis',
      syncStatus: 'central-synced'
    }))
  })

  it('enforces owner-only group member changes', () => {
    const service = createService()
    service.applyEvent(baseEvent({
      chatId: 'group-1',
      payload: {
        chatId: 'group-1',
        clientChatId: 'group-1',
        type: 'group',
        title: 'Outage group',
        memberIds: ['u-denis', 'u-anna']
      }
    }))

    expect(() => service.applyEvent(baseEvent({
      eventId: 'device-b:add-1',
      originDeviceId: 'device-b',
      actorUserId: 'u-anna',
      chatId: 'group-1',
      type: 'member.added',
      payload: { chatId: 'group-1', memberId: 'u-mark' }
    }))).toThrow(/Only the group owner/)
  })

  it('throws when a member removal affects no removable member', () => {
    const service = createService()
    service.applyEvent(baseEvent({
      chatId: 'group-1',
      payload: {
        chatId: 'group-1',
        clientChatId: 'group-1',
        type: 'group',
        title: 'Outage group',
        memberIds: ['u-denis', 'u-anna']
      }
    }))

    expect(() => service.applyEvent(baseEvent({
      eventId: 'device-a:remove-missing',
      chatId: 'group-1',
      type: 'member.removed',
      payload: { chatId: 'group-1', memberId: 'u-mark' }
    }))).toThrow(/Member not found or is the group owner/)
  })


  it('rejects events whose top-level chatId does not match the payload chatId', () => {
    const service = createService()

    expect(() => service.applyEvent(baseEvent({
      chatId: 'chat-top-level',
      payload: {
        chatId: 'chat-payload',
        clientChatId: 'chat-payload',
        type: 'direct',
        memberIds: ['u-denis', 'u-anna']
      }
    }))).toThrow(/event.chatId must match payload.chatId/)
  })

  it('rejects malformed message events before projection', () => {
    const service = createService()
    service.applyEvent(baseEvent())

    expect(() => service.applyEvent(messageCreatedEvent({
      eventId: 'device-a:empty-message',
      chatId: 'chat-1',
      payload: {
        chatId: 'chat-1',
        messageId: 'msg-empty',
        clientMessageId: 'msg-empty',
        text: '   '
      }
    }))).toThrow(/message text cannot be empty/)
  })


  it('rejects event IDs that do not follow the originDeviceId:eventId format', () => {
    const service = createService()

    expect(() => service.applyEvent(baseEvent({
      eventId: 'x'
    }))).toThrow(/eventId must be in originDeviceId:eventId format/)
  })

  it('rejects non-ISO event timestamps', () => {
    const service = createService()

    expect(() => service.applyEvent(baseEvent({
      createdAt: '2000'
    }))).toThrow(/createdAt must be an ISO 8601 date string/)
  })


  it('marks helper events as helper-synced until central confirms them', () => {
    const service = createService('helper')
    const result = service.applyEvent(baseEvent())
    expect(result.event.syncStatus).toBe('helper-synced')
    expect(service.getPendingCentralSync()).toHaveLength(1)

    service.markCentralSynced([result.event.eventId])
    expect(service.getPendingCentralSync()).toHaveLength(0)
  })

  it('returns projection conflicts without crashing a sync batch', () => {
    const service = createService()
    const good = baseEvent({ eventId: 'device-a:good-chat' })
    const bad = baseEvent({
      eventId: 'device-a:bad-member',
      chatId: 'missing-chat',
      type: 'member.added',
      payload: { chatId: 'missing-chat', memberId: 'u-anna' }
    })

    const result = service.applyEvents([good, bad])

    expect(result.accepted).toContain(good.eventId)
    expect(result.conflicts).toContain(bad.eventId)
    expect(service.listChats('u-denis')).toHaveLength(1)
  })

  it('stores and updates helper pull-sync cursors', () => {
    const service = createService('helper')
    expect(service.getSyncCursor('central:sequence')).toBe(0)
    service.setSyncCursor('central:sequence', 42)
    expect(service.getSyncCursor('central:sequence')).toBe(42)
  })
})
