import type { ChatId, DeviceId, EventId, MessageId, NodeId, UserId } from './ids.js'
import type { ChatType } from './chat.js'

export type EventSyncStatus =
  | 'local'
  | 'peer-replicated'
  | 'helper-synced'
  | 'central-synced'
  | 'conflict'

export type ChatEventType =
  | 'chat.created'
  | 'member.added'
  | 'member.removed'
  | 'message.created'
  | 'message.read'

export interface ChatCreatedPayload {
  chatId: ChatId
  clientChatId?: string
  directPairKey?: string
  type: ChatType
  title?: string
  memberIds: UserId[]
}

export interface MemberChangedPayload {
  chatId: ChatId
  memberId: UserId
}

export interface MessageCreatedPayload {
  messageId: MessageId
  clientMessageId: string
  chatId: ChatId
  text: string
}

export interface MessageReadPayload {
  chatId: ChatId
  messageId: MessageId
}

export type ChatEventPayload =
  | ChatCreatedPayload
  | MemberChangedPayload
  | MessageCreatedPayload
  | MessageReadPayload

export interface ChatEvent<TPayload = ChatEventPayload> {
  eventId: EventId
  originNodeId: NodeId
  originDeviceId: DeviceId
  actorUserId: UserId
  chatId: ChatId
  type: ChatEventType
  payload: TPayload
  createdAt: string
  logicalClock: number
  syncStatus: EventSyncStatus
}

export type ChatCreatedEvent = ChatEvent<ChatCreatedPayload> & { type: 'chat.created' }
export type MemberAddedEvent = ChatEvent<MemberChangedPayload> & { type: 'member.added' }
export type MemberRemovedEvent = ChatEvent<MemberChangedPayload> & { type: 'member.removed' }
export type MessageCreatedEvent = ChatEvent<MessageCreatedPayload> & { type: 'message.created' }
export type MessageReadEvent = ChatEvent<MessageReadPayload> & { type: 'message.read' }
export type TypedChatEvent =
  | ChatCreatedEvent
  | MemberAddedEvent
  | MemberRemovedEvent
  | MessageCreatedEvent
  | MessageReadEvent
