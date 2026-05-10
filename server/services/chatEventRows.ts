import type { ChatEvent, EventSyncStatus } from '../../shared/types.js'

export interface EventRow {
  sequence: number
  event_id: string
  origin_node_id: string
  origin_device_id: string
  actor_user_id: string
  chat_id: string
  type: ChatEvent['type']
  payload_json: string
  created_at: string
  logical_clock: number
  sync_status: EventSyncStatus
}

export interface MessageRow {
  id: string
  client_message_id: string | null
  chat_id: string
  sender_id: string
  sender_name: string
  text: string
  created_at: string
  sync_status: EventSyncStatus
}

export interface ChatRow {
  id: string
  client_chat_id: string | null
  direct_pair_key: string | null
  type: 'direct' | 'group'
  title: string | null
  created_by: string
  created_at: string
  sync_status: EventSyncStatus
}

export interface MemberRow {
  chat_id: string
  userId: string
  name: string
  joinedAt: string
  leftAt: string | null
  isOwner: number
}
