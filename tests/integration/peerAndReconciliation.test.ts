import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPeerMesh } from '../../client/src/services/realtime/peerMesh'
import { reconcileDirectChatConfirmation } from '../../client/src/chat/events/directChatReconciliation'
import { useChatState } from '../../client/src/chat/composables/useChatState'
import { localDb, saveLocalEvent } from '../../client/src/storage/localDb'
import type { UserId } from '../../shared/types'
import {
  FakeDataChannel,
  installFakePeerConnection,
  restorePeerConnection
} from '../helpers/fakePeerConnection'
import {
  chatCreated,
  messageCreated
} from './helpers'

describe('peer routing and direct-chat reconciliation integration', () => {
  beforeEach(async () => {
    await localDb.delete()
    await localDb.open()
    vi.restoreAllMocks()
  })

  it('sends peer-replicated events only to selected peer targets', () => {
    const originalPeerConnection = globalThis.RTCPeerConnection
    const channels = new Map<UserId, FakeDataChannel>()
    installFakePeerConnection(['u-denis', 'u-mark'], channels)

    try {
      const mesh = createPeerMesh({
        currentUserId: () => 'u-anna',
        deviceId: 'device-anna',
        sendSignal: vi.fn(),
        getEventsForPeer: vi.fn(async () => []),
        getEventsByIdsForPeer: vi.fn(async () => []),
        onEvent: vi.fn(async () => true)
      })
      mesh.updatePeers(['u-denis', 'u-mark'])
      const event = messageCreated('chat-anna-denis')

      mesh.publishEvent(event, ['u-denis'])

      expect(channels.get('u-denis')?.sent).toHaveLength(1)
      expect(channels.get('u-denis')?.sent[0]).toContain(event.eventId)
      expect(channels.get('u-mark')?.sent).toHaveLength(0)
      mesh.close()
    } finally {
      restorePeerConnection(originalPeerConnection)
    }
  })

  it('remaps a duplicate offline direct chat to the accepted central chat id', async () => {
    globalThis.localStorage = {
      getItem: vi.fn(() => 'u-denis'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0
    } as Storage
    const state = useChatState()
    const localChat = chatCreated({
      eventId: 'local:duplicate-direct',
      chatId: 'chat-local-duplicate',
      payload: {
        chatId: 'chat-local-duplicate',
        clientChatId: 'chat-local-duplicate',
        type: 'direct',
        memberIds: ['u-denis', 'u-anna']
      }
    })
    const acceptedChat = chatCreated({
      eventId: 'central:accepted-direct',
      originNodeId: 'central-demo',
      chatId: 'chat-central-accepted',
      syncStatus: 'central-synced',
      payload: {
        chatId: 'chat-central-accepted',
        clientChatId: 'chat-central-accepted',
        type: 'direct',
        memberIds: ['u-anna', 'u-denis']
      }
    })
    const pendingMessage = messageCreated('chat-local-duplicate')

    state.applyEvent(localChat)
    state.activeChatId.value = 'chat-local-duplicate'
    await saveLocalEvent(localChat)
    await saveLocalEvent(pendingMessage)

    const result = await reconcileDirectChatConfirmation(state, acceptedChat, localChat)
    const savedEvents = await localDb.events.orderBy('eventId').toArray()

    expect(result).toEqual({
      remappedChat: {
        fromChatId: 'chat-local-duplicate',
        toChatId: 'chat-central-accepted'
      }
    })
    expect(state.activeChatId.value).toBe('chat-central-accepted')
    expect(state.chats.value.map((chat) => chat.id)).toContain('chat-central-accepted')
    expect(savedEvents.map((event) => event.chatId)).toEqual([
      'chat-central-accepted',
      'chat-central-accepted'
    ])
    expect(savedEvents.map((event) => (event.payload as { chatId?: string }).chatId)).toEqual([
      'chat-central-accepted',
      'chat-central-accepted'
    ])
  })
})
