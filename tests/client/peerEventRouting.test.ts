import { describe, expect, it } from 'vitest'
import {
  canAcceptPeerEvent,
  peerTargetUserIds,
  peerTargetUserIdsFromEvents
} from '../../client/src/chat/events/peerEventRouting'
import type { ChatEvent, ChatSummary } from '../../shared/types'
import { chatCreatedEvent, messageCreatedEvent } from '../helpers/chatEvents'

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
  return messageCreatedEvent({
    chatId,
    originNodeId: 'central-demo',
    originDeviceId: 'device-denis',
    payload: {
      chatId,
      text: 'Private message'
    }
  })
}

describe('peer event routing', () => {
  it('targets only members of the event chat', () => {
    expect(peerTargetUserIds(chats, 'u-denis', messageEvent('chat-anna'))).toEqual(['u-anna'])
  })

  it('rejects peer events for chats the current user does not belong to', () => {
    expect(canAcceptPeerEvent(chats, 'u-mark', messageEvent('chat-anna'))).toBe(false)
    expect(canAcceptPeerEvent(chats, 'u-anna', messageEvent('chat-anna'))).toBe(true)
  })

  it('can route relayed message events using the saved chat creation event', () => {
    const chatCreated = chatCreatedEvent({
      chatId: 'chat-kate-denis',
      actorUserId: 'u-kate',
      payload: {
        chatId: 'chat-kate-denis',
        clientChatId: 'chat-kate-denis',
        type: 'direct',
        memberIds: ['u-denis']
      }
    })
    const message = messageEvent('chat-kate-denis')

    expect(peerTargetUserIdsFromEvents(chats, 'u-ivan', message, [chatCreated, message])).toEqual([
      'u-kate',
      'u-denis'
    ])
  })
})
