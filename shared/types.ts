export type UserId = string
export type ChatId = string
export type MessageId = string
export type EventId = string
export type DeviceId = string
export type NodeId = string

export type NodeRole = 'central' | 'helper'
export type ChatType = 'direct' | 'group'

export const RECOVERY_DUMP_FORMAT = 'durable-chat-recovery-v1' as const

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

export interface AppConfig {
  nodeRole: NodeRole
  nodeId: NodeId
  centralUrl?: string
  helperUrl?: string
  vapidPublicKey?: string
}

export interface SyncRequest {
  sourceNodeId: NodeId
  sourceDeviceId?: DeviceId
  events: ChatEvent[]
}

export interface SyncResponse {
  accepted: EventId[]
  duplicates: EventId[]
  conflicts: EventId[]
  serverEvents: ChatEvent[]
  nodeRole: NodeRole
  nodeId: NodeId
}

export interface SyncPullResponse {
  nodeRole: NodeRole
  nodeId: NodeId
  latestSequence: number
  events: ChatEvent[]
}

export interface RecoveryDump {
  format: typeof RECOVERY_DUMP_FORMAT
  exportedAt: string
  exportedBy: UserId
  deviceId: DeviceId
  events: ChatEvent[]
  note?: string
}

export interface ConnectionState {
  mode: 'central' | 'helper' | 'peer' | 'offline'
  isConnected: boolean
  label: string
}

export interface PeerAck {
  eventId: EventId
  peerDeviceId: DeviceId
  acknowledgedAt: string
}

export interface PeerSessionDescription {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback'
  sdp: string
}

export interface PeerIceCandidate {
  candidate: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
  usernameFragment?: string | null
}

export type PeerSignalPayload =
  | { type: 'offer'; sdp: PeerSessionDescription }
  | { type: 'answer'; sdp: PeerSessionDescription }
  | { type: 'candidate'; candidate: PeerIceCandidate }

export interface PeerSignalMessage {
  fromUserId: UserId
  fromDeviceId: DeviceId
  signal: PeerSignalPayload
}
