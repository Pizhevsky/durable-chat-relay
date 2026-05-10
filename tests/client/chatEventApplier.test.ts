import { describe, expect, it } from 'vitest'
import { reactive, ref } from 'vue'
import { createChatEventApplier } from '../../client/src/chat/events/chatEventApplier'
import type { ChatEvent, ChatSummary, Message, User } from '../../shared/types'

function messageEvent(chatId: string, overrides: Partial<ChatEvent> = {}): ChatEvent {
  const messageId = `msg-${crypto.randomUUID()}`
  return {
    eventId: `browser-test:${crypto.randomUUID()}`,
    originNodeId: 'central-demo',
    originDeviceId: 'device-denis',
    actorUserId: 'u-denis',
    chatId,
    type: 'message.created',
    payload: {
      messageId,
      clientMessageId: messageId,
      chatId,
      text: 'Private message'
    },
    createdAt: new Date().toISOString(),
    logicalClock: 1,
    syncStatus: 'central-synced',
    ...overrides
  }
}

describe('chat event applier', () => {
  it('does not surface notifications or messages for chats the current user does not have', () => {
    const users = ref<User[]>([{ id: 'u-anna', name: 'Anna' }, { id: 'u-denis', name: 'Denis' }])
    const chats = ref<ChatSummary[]>([])
    const messagesByChat = reactive<Record<string, Message[]>>({})
    const recentEvents = ref<ChatEvent[]>([])

    const applier = createChatEventApplier({
      users,
      chats,
      messagesByChat,
      activeChatId: ref(null),
      currentUserId: ref('u-anna'),
      recentEvents,
      upsertChat: (chat) => {
        chats.value = [chat, ...chats.value.filter((item) => item.id !== chat.id)]
      },
      removeChat: (chatId) => {
        chats.value = chats.value.filter((chat) => chat.id !== chatId)
      },
      upsertMessage: (message) => {
        messagesByChat[message.chatId] = [...(messagesByChat[message.chatId] ?? []), message]
      }
    })

    const result = applier.applyEvent(messageEvent('chat-denis-mark'))

    expect(result).toEqual({ needsRefresh: true })
    expect(messagesByChat['chat-denis-mark']).toBeUndefined()
  })

  it('does not increment unread count when the same message event is replayed', () => {
    const users = ref<User[]>([{ id: 'u-anna', name: 'Anna' }, { id: 'u-denis', name: 'Denis' }])
    const chats = ref<ChatSummary[]>([{
      id: 'chat-group',
      clientChatId: 'chat-group',
      directPairKey: null,
      type: 'group',
      title: 'Field group',
      createdBy: 'u-denis',
      createdAt: '2026-01-01T00:00:00.000Z',
      syncStatus: 'central-synced',
      members: [],
      unreadCount: 0,
      lastMessage: null
    }])
    const messagesByChat = reactive<Record<string, Message[]>>({})
    const recentEvents = ref<ChatEvent[]>([])

    const applier = createChatEventApplier({
      users,
      chats,
      messagesByChat,
      activeChatId: ref(null),
      currentUserId: ref('u-anna'),
      recentEvents,
      upsertChat: (chat) => {
        const index = chats.value.findIndex((item) => item.id === chat.id)
        if (index >= 0) chats.value[index] = chat
        else chats.value.unshift(chat)
      },
      removeChat: (chatId) => {
        chats.value = chats.value.filter((chat) => chat.id !== chatId)
      },
      upsertMessage: (message) => {
        const messages = messagesByChat[message.chatId] ?? []
        const index = messages.findIndex((item) => item.id === message.id)
        if (index >= 0) messages[index] = message
        else messages.push(message)
        messagesByChat[message.chatId] = [...messages]
      }
    })

    const event = messageEvent('chat-group')

    applier.applyEvent(event)
    applier.applyEvent(event)
    applier.applyEvent({ ...event, eventId: 'socket:replayed-copy' })

    expect(chats.value[0].unreadCount).toBe(1)
    expect(messagesByChat['chat-group']).toHaveLength(1)
  })
})
