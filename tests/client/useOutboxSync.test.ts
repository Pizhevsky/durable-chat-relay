import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOutboxSync } from '../../client/src/chat/composables/useOutboxSync'
import { localDb, pendingEvents, saveLocalEvent } from '../../client/src/storage/localDb'
import type { ChatEvent, ChatId } from '../../shared/types'

function messageEvent(chatId: ChatId = 'chat-test'): ChatEvent {
  return {
    eventId: `browser-test:${crypto.randomUUID()}`,
    originNodeId: 'browser-test',
    originDeviceId: 'browser-test',
    actorUserId: 'u-denis',
    chatId,
    type: 'message.created',
    payload: {
      messageId: 'msg-test',
      clientMessageId: 'msg-test',
      chatId,
      text: 'Retry after reconnect'
    },
    createdAt: new Date().toISOString(),
    logicalClock: 1,
    syncStatus: 'local'
  }
}

function chatCreatedEvent(chatId: ChatId): ChatEvent {
  return {
    eventId: `browser-test:${crypto.randomUUID()}`,
    originNodeId: 'browser-test',
    originDeviceId: 'browser-test',
    actorUserId: 'u-denis',
    chatId,
    type: 'chat.created',
    payload: {
      chatId,
      clientChatId: chatId,
      type: 'direct',
      memberIds: ['u-denis', 'u-anna']
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    logicalClock: 1,
    syncStatus: 'local'
  }
}

describe('useOutboxSync', () => {
  beforeEach(async () => {
    await localDb.delete()
    await localDb.open()
  })

  it('flushes a failed local event after connectivity returns', async () => {
    const item = messageEvent()
    await saveLocalEvent(item)

    const publishOnline = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...item, syncStatus: 'central-synced' })

    const outbox = useOutboxSync({
      publishOnline,
      onEventConfirmed: vi.fn(),
      onPendingCount: vi.fn()
    })

    await outbox.retryPending()
    expect(await pendingEvents()).toHaveLength(1)

    await outbox.retryPending()
    expect(await pendingEvents()).toHaveLength(0)
    expect(publishOnline).toHaveBeenCalledTimes(2)
  })

  it('uses stored direct-chat remap before retrying later pending events', async () => {
    const localChat = chatCreatedEvent('chat-local')
    const localMessage = messageEvent('chat-local')
    const acceptedChat = {
      ...localChat,
      chatId: 'chat-central',
      syncStatus: 'central-synced',
      payload: {
        ...localChat.payload,
        chatId: 'chat-central',
        clientChatId: 'chat-central'
      }
    } as ChatEvent

    await saveLocalEvent(localChat)
    await saveLocalEvent(localMessage)

    const publishOnline = vi.fn()
      .mockResolvedValueOnce(acceptedChat)
      .mockImplementationOnce(async (eventToPublish: ChatEvent) => ({
        ...eventToPublish,
        syncStatus: 'central-synced'
      }))

    const outbox = useOutboxSync({
      publishOnline,
      onEventConfirmed: vi.fn(async (confirmed, original) => {
        if (original.eventId !== localChat.eventId) return undefined
        return {
          remappedChat: {
            fromChatId: original.chatId,
            toChatId: confirmed.chatId
          }
        }
      }),
      onPendingCount: vi.fn()
    })

    await outbox.retryPending()

    const retriedMessage = publishOnline.mock.calls[1]?.[0] as ChatEvent
    const savedEvents = await localDb.events.orderBy('createdAt').toArray()

    expect(retriedMessage.chatId).toBe('chat-central')
    expect((retriedMessage.payload as { chatId?: string }).chatId).toBe('chat-central')
    expect(savedEvents.map((eventRecord) => eventRecord.chatId)).toEqual([
      'chat-central',
      'chat-central'
    ])
  })
})
