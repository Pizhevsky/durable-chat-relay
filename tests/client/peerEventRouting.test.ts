import { describe, expect, it } from 'vitest'
import { canAcceptPeerEvent, peerTargetUserIds } from '../../client/src/chat/events/peerEventRouting'
import type { ChatEvent, ChatSummary } from '../../shared/types'

const chats: ChatSummary[] = [
  {
    id: 'chat-anna',
    type: 'direct',
    title: 'Anna',
    createdBy: 'u-denis',
    createdAt: '2026-01-01T00:00:00.000Z',
    members: [
      { userId: 'u-denis', name: 'Denis', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null, isOwner: true },
      { userId: 'u-anna', name: 'Anna', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null, isOwner: false }
    ],
    unreadCount: 0
  },
  {
    id: 'chat-mark',
    type: 'direct',
    title: 'Mark',
    createdBy: 'u-denis',
    createdAt: '2026-01-01T00:00:00.000Z',
    members: [
      { userId: 'u-denis', name: 'Denis', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null, isOwner: true },
      { userId: 'u-mark', name: 'Mark', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null, isOwner: false }
    ],
    unreadCount: 0
  }
]

function messageEvent(chatId: string): ChatEvent {
  return {
    eventId: `browser-test:${crypto.randomUUID()}`,
    originNodeId: 'central-demo',
    originDeviceId: 'device-denis',
    actorUserId: 'u-denis',
    chatId,
    type: 'message.created',
    payload: {
      messageId: `msg-${crypto.randomUUID()}`,
      clientMessageId: `msg-${crypto.randomUUID()}`,
      chatId,
      text: 'Private message'
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    logicalClock: 1,
    syncStatus: 'local'
  }
}

describe('peer event routing', () => {
  it('targets only members of the event chat', () => {
    expect(peerTargetUserIds(chats, 'u-denis', messageEvent('chat-anna'))).toEqual(['u-anna'])
  })

  it('rejects peer events for chats the current user does not belong to', () => {
    expect(canAcceptPeerEvent(chats, 'u-mark', messageEvent('chat-anna'))).toBe(false)
    expect(canAcceptPeerEvent(chats, 'u-anna', messageEvent('chat-anna'))).toBe(true)
  })
})
