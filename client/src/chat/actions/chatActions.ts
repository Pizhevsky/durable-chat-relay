import { createChatEvent } from '../../services/eventFactory'
import { canonicalDirectPairKey, createChatId, createMessageId } from '../../utils/chatIdentity'
import type { ChatState } from '../composables/useChatState'
import type {
  ChatCreatedPayload,
  ChatEvent,
  ChatId,
  DeviceId,
  MessageCreatedPayload,
  MessageReadPayload,
  NodeId,
  UserId
} from '../../../../shared/types'

export interface ChatActions {
  createDirectChat: (memberId: UserId) => Promise<void>
  createGroupChat: (title: string, memberIds: UserId[]) => Promise<void>
  sendMessage: (text: string) => Promise<void>
  markActiveMessagesRead: () => Promise<void>
}

interface ChatActionsInput {
  state: ChatState
  deviceId: DeviceId
  nodeId: () => NodeId
  openChat: (chatId: ChatId) => Promise<void>
  refreshChats: () => Promise<void>
  persistVisibleState: (chatId?: ChatId | null) => Promise<void>
  saveAndSend: (event: ChatEvent) => Promise<void>
}

export function createChatActions(input: ChatActionsInput): ChatActions {
  const { state } = input

  async function createDirectChat(memberId: UserId): Promise<void> {
    await input.refreshChats()

    const existing = state.findDirectChat(memberId)
    if (existing) {
      await input.openChat(existing.id)
      return
    }

    const chatId = createChatId()
    const directPairKey = canonicalDirectPairKey(state.currentUserId.value, memberId)
    const payload: ChatCreatedPayload = {
      chatId,
      clientChatId: chatId,
      directPairKey,
      type: 'direct',
      memberIds: [state.currentUserId.value, memberId]
    }

    const event = createChatEvent({
      nodeId: input.nodeId(),
      deviceId: input.deviceId,
      actorUserId: state.currentUserId.value,
      chatId,
      type: 'chat.created',
      payload
    })

    state.applyEvent(event)
    await input.persistVisibleState(chatId)
    await input.openChat(chatId)
    await input.saveAndSend(event)
  }

  async function createGroupChat(title: string, memberIds: UserId[]): Promise<void> {
    const chatId = createChatId()
    const payload: ChatCreatedPayload = {
      chatId,
      clientChatId: chatId,
      type: 'group',
      title,
      memberIds: [state.currentUserId.value, ...memberIds]
    }

    const event = createChatEvent({
      nodeId: input.nodeId(),
      deviceId: input.deviceId,
      actorUserId: state.currentUserId.value,
      chatId,
      type: 'chat.created',
      payload
    })

    state.applyEvent(event)
    await input.persistVisibleState(chatId)
    await input.openChat(chatId)
    await input.saveAndSend(event)
  }

  async function sendMessage(text: string): Promise<void> {
    if (!state.activeChatId.value || !text.trim()) return
    const messageId = createMessageId()
    const payload: MessageCreatedPayload = {
      messageId,
      clientMessageId: messageId,
      chatId: state.activeChatId.value,
      text: text.trim()
    }

    const event = createChatEvent({
      nodeId: input.nodeId(),
      deviceId: input.deviceId,
      actorUserId: state.currentUserId.value,
      chatId: state.activeChatId.value,
      type: 'message.created',
      payload
    })

    state.applyEvent(event)
    await input.persistVisibleState(state.activeChatId.value)
    await input.saveAndSend(event)
  }

  async function markActiveMessagesRead(): Promise<void> {
    const chat = state.activeChat.value
    if (!chat) return

    const unreadMessages = state.activeMessages.value.filter((message) =>
      message.senderId !== state.currentUserId.value &&
      !message.readBy.includes(state.currentUserId.value)
    )

    for (const message of unreadMessages) {
      const payload: MessageReadPayload = {
        chatId: message.chatId,
        messageId: message.id
      }

      const event = createChatEvent({
        nodeId: input.nodeId(),
        deviceId: input.deviceId,
        actorUserId: state.currentUserId.value,
        chatId: message.chatId,
        type: 'message.read',
        payload
      })

      state.applyEvent(event)
      await input.persistVisibleState(message.chatId)
      await input.saveAndSend(event)
    }
  }

  return {
    createDirectChat,
    createGroupChat,
    sendMessage,
    markActiveMessagesRead
  }
}
