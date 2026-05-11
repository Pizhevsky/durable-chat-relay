import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOutboxSync } from '../../client/src/chat/composables/useOutboxSync'
import { localDb, pendingEvents, saveLocalEvent } from '../../client/src/storage/localDb'
import type { ChatEvent, SyncResponse } from '../../shared/types'
import { chatCreatedEvent, messageCreatedEvent } from '../helpers/chatEvents'

function centralSynced(event: ChatEvent): ChatEvent {
  return { ...event, syncStatus: 'central-synced' }
}


describe('useOutboxSync', () => {
  beforeEach(async () => {
    await localDb.delete()
    await localDb.open()
  })


  it('saves a local event before any peer or online delivery hook runs', async () => {
    const item = messageCreatedEvent({ eventId: 'device-a:save-before-peer' })
    const calls: string[] = []

    const outbox = useOutboxSync({
      getUserId: () => 'u-denis',
      publishOnline: vi.fn(async (event: ChatEvent) => {
        calls.push('publish-online')
        return centralSynced(event)
      }),
      syncReplicated: vi.fn(),
      onEventConfirmed: vi.fn(),
      onPendingCount: vi.fn(),
      onEventSaved: vi.fn(async (event: ChatEvent) => {
        const saved = await localDb.events.get(event.eventId)
        calls.push(saved ? 'saved-before-peer' : 'missing-before-peer')
      })
    })

    await outbox.saveAndSend(item)

    expect(calls).toEqual(['saved-before-peer', 'publish-online'])
  })


  it('flushes a failed local event after connectivity returns', async () => {
    const item = messageCreatedEvent()
    await saveLocalEvent(item)

    const publishOnline = vi.fn(async (event: ChatEvent): Promise<ChatEvent> => centralSynced(event))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(centralSynced(item))

    const outbox = useOutboxSync({
      getUserId: () => 'u-denis',
      publishOnline,
      syncReplicated: vi.fn(),
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
    const localChat = chatCreatedEvent({ chatId: 'chat-local' })
    const localMessage = messageCreatedEvent({ chatId: 'chat-local', payload: { chatId: 'chat-local' } })
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

    const publishOnline = vi.fn(async (eventToPublish: ChatEvent): Promise<ChatEvent> => centralSynced(eventToPublish))
      .mockResolvedValueOnce(acceptedChat)
      .mockImplementationOnce(async (eventToPublish: ChatEvent): Promise<ChatEvent> => centralSynced(eventToPublish))

    const outbox = useOutboxSync({
      getUserId: () => 'u-denis',
      publishOnline,
      syncReplicated: vi.fn(),
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

  it('does not retry another demo user event from the shared browser outbox', async () => {
    const denisMessage = messageCreatedEvent({
      chatId: 'chat-group',
      actorUserId: 'u-denis',
      payload: { chatId: 'chat-group' }
    })
    const ivanMessage = messageCreatedEvent({
      chatId: 'chat-group',
      actorUserId: 'u-ivan',
      payload: { chatId: 'chat-group' }
    })
    await saveLocalEvent(denisMessage)
    await saveLocalEvent(ivanMessage)

    const pendingCount = vi.fn()
    const publishOnline = vi.fn(async (eventToPublish: ChatEvent): Promise<ChatEvent> => centralSynced(eventToPublish))

    const outbox = useOutboxSync({
      getUserId: () => 'u-ivan',
      publishOnline,
      syncReplicated: vi.fn(),
      onEventConfirmed: vi.fn(),
      onPendingCount: pendingCount
    })

    await outbox.refreshPendingCount()
    await outbox.retryPending()

    expect(pendingCount).toHaveBeenCalledWith(1)
    expect(publishOnline).toHaveBeenCalledTimes(1)
    expect(publishOnline).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'u-ivan',
      eventId: ivanMessage.eventId
    }))
    expect(await localDb.events.get(denisMessage.eventId)).toEqual(expect.objectContaining({
      localStatus: 'pending',
      actorUserId: 'u-denis'
    }))
  })

  it('syncs peer-replicated events without rewriting original authorship', async () => {
    const denisPeerMessage = {
      ...messageCreatedEvent({
        chatId: 'chat-group',
        actorUserId: 'u-denis',
        payload: { chatId: 'chat-group' }
      }),
      syncStatus: 'peer-replicated'
    } as ChatEvent

    await localDb.events.put({
      ...denisPeerMessage,
      localStatus: 'peer-replicated',
      retryCount: 0,
      updatedAt: denisPeerMessage.createdAt
    })

    const publishOnline = vi.fn(async (event: ChatEvent): Promise<ChatEvent> => centralSynced(event))
    const syncReplicated = vi.fn(async (events: ChatEvent[]): Promise<SyncResponse> => ({
      accepted: events.map((event) => event.eventId),
      duplicates: [],
      conflicts: [],
      serverEvents: events.map((event) => centralSynced(event)),
      nodeRole: 'central' as const,
      nodeId: 'central-demo'
    }))

    const outbox = useOutboxSync({
      getUserId: () => 'u-ivan',
      publishOnline,
      syncReplicated,
      onEventConfirmed: vi.fn(),
      onPendingCount: vi.fn()
    })

    await outbox.retryPending()

    expect(publishOnline).not.toHaveBeenCalled()
    expect(syncReplicated).toHaveBeenCalledWith([
      expect.objectContaining({
        actorUserId: 'u-denis',
        eventId: denisPeerMessage.eventId
      })
    ])
    expect(await localDb.events.get(denisPeerMessage.eventId)).toEqual(expect.objectContaining({
      actorUserId: 'u-denis',
      localStatus: 'sent-to-central'
    }))
  })

  it('syncs helper-synced events authored by other users', async () => {
    const denisHelperMessage = {
      ...messageCreatedEvent({
        eventId: 'browser-test:helper-denis',
        chatId: 'chat-group',
        actorUserId: 'u-denis',
        payload: { chatId: 'chat-group' }
      }),
      syncStatus: 'helper-synced'
    } as ChatEvent

    await localDb.events.put({
      ...denisHelperMessage,
      localStatus: 'sent-to-helper',
      retryCount: 0,
      updatedAt: denisHelperMessage.createdAt
    })

    const publishOnline = vi.fn(async (event: ChatEvent): Promise<ChatEvent> => centralSynced(event))
    const syncReplicated = vi.fn(async (events: ChatEvent[]): Promise<SyncResponse> => ({
      accepted: events.map((event) => event.eventId),
      duplicates: [],
      conflicts: [],
      serverEvents: events.map((event) => centralSynced(event)),
      nodeRole: 'central' as const,
      nodeId: 'central-demo'
    }))

    const outbox = useOutboxSync({
      getUserId: () => 'u-ivan',
      publishOnline,
      syncReplicated,
      onEventConfirmed: vi.fn(),
      onPendingCount: vi.fn()
    })

    await outbox.retryPending()

    expect(publishOnline).not.toHaveBeenCalled()
    expect(syncReplicated).toHaveBeenCalledWith([
      expect.objectContaining({
        actorUserId: 'u-denis',
        eventId: denisHelperMessage.eventId,
        localStatus: 'sent-to-helper'
      })
    ])
    expect(await localDb.events.get(denisHelperMessage.eventId)).toEqual(expect.objectContaining({
      actorUserId: 'u-denis',
      localStatus: 'sent-to-central'
    }))
  })
})
