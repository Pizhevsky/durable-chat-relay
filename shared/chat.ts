import type { ChatId, MessageId, UserId } from './ids.js'
import type { EventSyncStatus } from './events.js'

export type ChatType = 'direct' | 'group'

export interface User {
  id: UserId
  name: string
  role?: string
  isOnline?: boolean
}

export interface ChatMember {
  userId: UserId
  name: string
  joinedAt: string
  leftAt?: string | null
  isOwner: boolean
}

export interface ChatSummary {
  id: ChatId
  clientChatId?: string | null
  directPairKey?: string | null
  type: ChatType
  title: string
  createdBy: UserId
  createdAt: string
  members: ChatMember[]
  unreadCount: number
  lastMessage?: Message | null
  syncStatus?: EventSyncStatus
}

export interface Message {
  id: MessageId
  clientMessageId?: string | null
  chatId: ChatId
  senderId: UserId
  senderName: string
  text: string
  createdAt: string
  syncStatus: EventSyncStatus
  readBy: UserId[]
}
