import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PeerMesh } from '../../client/src/services/realtime/peerTypes'
import { usePeerReplication } from '../../client/src/chat/composables/usePeerReplication'
import { useChatState } from '../../client/src/chat/composables/useChatState'
import { chatCreatedEvent } from '../helpers/chatEvents'

const peerMesh = vi.hoisted(() => ({
  updatePeers: vi.fn(),
  publishEvent: vi.fn(),
  handleSignal: vi.fn(),
  close: vi.fn()
}))

vi.mock('../../client/src/services/realtime/peerMesh', () => ({
  createPeerMesh: vi.fn(() => peerMesh satisfies PeerMesh)
}))

describe('usePeerReplication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('proactively targets a new direct chat member before peer publishing', () => {
    const state = useChatState()
    state.currentUserId.value = 'u-denis'
    state.chats.value = [
      {
        id: 'chat-anna-denis',
        type: 'direct',
        title: 'Anna',
        createdBy: 'u-denis',
        createdAt: '2026-01-01T00:00:00.000Z',
        members: [
          { userId: 'u-denis', name: 'Denis', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null, isOwner: true },
          { userId: 'u-anna', name: 'Anna', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null, isOwner: false }
        ],
        unreadCount: 0
      }
    ]

    const replication = usePeerReplication({
      state,
      deviceId: 'device-denis',
      localTransportPaused: ref(true),
      sendSignal: vi.fn(),
      onEventAccepted: vi.fn()
    })
    const event = chatCreatedEvent({
      chatId: 'chat-denis-ivan',
      actorUserId: 'u-denis',
      payload: {
        chatId: 'chat-denis-ivan',
        type: 'direct',
        memberIds: ['u-denis', 'u-ivan']
      }
    })

    replication.publishEvent(event)

    expect(peerMesh.updatePeers).toHaveBeenCalledWith(['u-anna', 'u-ivan'])
    expect(peerMesh.publishEvent).toHaveBeenCalledWith(event, ['u-ivan'])
  })
})
