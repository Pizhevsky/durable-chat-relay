import type { Ref } from 'vue'
import type {
  ChatCreatedPayload,
  ChatEvent,
  ChatMember,
  ChatSummary,
  MemberChangedPayload,
  Message,
  MessageCreatedPayload,
  MessageReadPayload,
  User
} from '../../../../shared/types'
import { canonicalDirectPairKey, uniqueUserIds } from '../../utils/chatIdentity'
import { directChatTitle, GROUP_CHAT_FALLBACK_TITLE } from '../../utils/chatLabels'

export interface ApplyEventResult {
  needsRefresh: boolean
  message?: Message
}

export function createChatEventApplier(input: {
  users: Ref<User[]>
  chats: Ref<ChatSummary[]>
  messagesByChat: Record<string, Message[]>
  activeChatId: Ref<string | null>
  currentUserId: Ref<string>
  recentEvents: Ref<ChatEvent[]>
  upsertChat: (chat: ChatSummary) => void
  removeChat: (chatId: string) => void
  upsertMessage: (message: Message) => void
}) {
  function applyEvent(event: ChatEvent): ApplyEventResult {
    rememberEvent(event)
    if (event.type === 'chat.created') return applyChatCreated(event as ChatEvent<ChatCreatedPayload>)
    if (event.type === 'member.added') return applyMemberAdded(event as ChatEvent<MemberChangedPayload>)
    if (event.type === 'member.removed') return applyMemberRemoved(event as ChatEvent<MemberChangedPayload>)
    if (event.type === 'message.created') return applyMessageCreated(event as ChatEvent<MessageCreatedPayload>)
    if (event.type === 'message.read') return applyMessageRead(event as ChatEvent<MessageReadPayload>)
    return { needsRefresh: true }
  }

  function applyChatCreated(event: ChatEvent<ChatCreatedPayload>): ApplyEventResult {
    const payload = event.payload
    if (!payload.memberIds.includes(input.currentUserId.value) && event.actorUserId !== input.currentUserId.value) {
      return { needsRefresh: false }
    }

    const memberIds = uniqueUserIds([event.actorUserId, ...payload.memberIds])
    const directPairKey = payload.type === 'direct' ? canonicalDirectPairKey(...memberIds) : null
    const existingDirect = directPairKey
      ? input.chats.value.find((chat) =>
        chat.type === 'direct' &&
        chat.directPairKey === directPairKey &&
        chat.id !== payload.chatId
      )
      : null

    if (existingDirect) {
      input.activeChatId.value = existingDirect.id
      return { needsRefresh: false }
    }

    const members = memberIds.map((memberId) => toMember(memberId, event.createdAt, memberId === event.actorUserId))
    const title = payload.type === 'direct'
      ? directChatTitle(members, input.currentUserId.value)
      : payload.title || GROUP_CHAT_FALLBACK_TITLE

    input.upsertChat({
      id: payload.chatId,
      clientChatId: payload.clientChatId,
      directPairKey,
      type: payload.type,
      title,
      createdBy: event.actorUserId,
      createdAt: event.createdAt,
      syncStatus: event.syncStatus,
      members,
      unreadCount: 0,
      lastMessage: null
    })

    return { needsRefresh: false }
  }

  function applyMemberAdded(event: ChatEvent<MemberChangedPayload>): ApplyEventResult {
    const chat = input.chats.value.find((item) => item.id === event.chatId)
    if (!chat) return { needsRefresh: event.payload.memberId === input.currentUserId.value }

    const member = toMember(event.payload.memberId, event.createdAt, false)
    chat.members = [...chat.members.filter((item) => item.userId !== member.userId), member]
    chat.syncStatus = event.syncStatus
    input.upsertChat({ ...chat })
    return { needsRefresh: false }
  }

  function applyMemberRemoved(event: ChatEvent<MemberChangedPayload>): ApplyEventResult {
    if (event.payload.memberId === input.currentUserId.value) {
      input.removeChat(event.chatId)
      return { needsRefresh: false }
    }

    const chat = input.chats.value.find((item) => item.id === event.chatId)
    if (!chat) return { needsRefresh: false }

    chat.members = chat.members.filter((member) => member.userId !== event.payload.memberId)
    chat.syncStatus = event.syncStatus
    input.upsertChat({ ...chat })
    return { needsRefresh: false }
  }

  function applyMessageCreated(event: ChatEvent<MessageCreatedPayload>): ApplyEventResult {
    const payload = event.payload
    const chat = input.chats.value.find((item) => item.id === payload.chatId)
    if (!chat) return { needsRefresh: true }

    const existingMessages = input.messagesByChat[payload.chatId] ?? []
    const isNewMessage = !existingMessages.some((message) =>
      message.id === payload.messageId || message.clientMessageId === payload.clientMessageId
    )
    const sender = input.users.value.find((user) => user.id === event.actorUserId)
    const message: Message = {
      id: payload.messageId,
      clientMessageId: payload.clientMessageId,
      chatId: payload.chatId,
      senderId: event.actorUserId,
      senderName: sender?.name ?? event.actorUserId,
      text: payload.text,
      createdAt: event.createdAt,
      syncStatus: event.syncStatus,
      readBy: [event.actorUserId]
    }

    input.upsertMessage(message)

    const isIncoming = event.actorUserId !== input.currentUserId.value
    const isActive = input.activeChatId.value === payload.chatId
    input.upsertChat({
      ...chat,
      lastMessage: message,
      unreadCount: isNewMessage && isIncoming && !isActive ? chat.unreadCount + 1 : chat.unreadCount,
      syncStatus: event.syncStatus
    })

    return { needsRefresh: false, message }
  }

  function applyMessageRead(event: ChatEvent<MessageReadPayload>): ApplyEventResult {
    const messages = input.messagesByChat[event.chatId]
    if (!messages) return { needsRefresh: false }

    const index = messages.findIndex((message) => message.id === event.payload.messageId)
    if (index < 0) return { needsRefresh: false }

    const message = messages[index]
    messages[index] = {
      ...message,
      readBy: uniqueUserIds([...message.readBy, event.actorUserId])
    }
    input.messagesByChat[event.chatId] = [...messages]

    const chat = input.chats.value.find((item) => item.id === event.chatId)
    if (chat && event.actorUserId === input.currentUserId.value) {
      input.upsertChat({ ...chat, unreadCount: 0, syncStatus: event.syncStatus })
    }

    return { needsRefresh: false }
  }

  function toMember(userId: string, joinedAt: string, isOwner: boolean): ChatMember {
    const user = input.users.value.find((item) => item.id === userId)
    return {
      userId,
      name: user?.name ?? userId,
      joinedAt,
      leftAt: null,
      isOwner
    }
  }

  function rememberEvent(event: ChatEvent): void {
    input.recentEvents.value = [
      event,
      ...input.recentEvents.value.filter((item) => item.eventId !== event.eventId)
    ].slice(0, 25)
  }

  return { applyEvent }
}
