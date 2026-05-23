import type {
  ChatEvent,
  ChatMember,
  EventId,
  EventSyncStatus,
  UserId
} from '../../shared/types.js'
import { DirectPairKey } from '../../shared/domain/DirectPairKey.js'
import type { EventRow } from './chatEventRows.js'

export function canonicalDirectPairKey(memberIds: UserId[]): string {
  return DirectPairKey.fromUserIds(memberIds).value
}

export function directChatTitle(members: ChatMember[], currentUserId: UserId): string {
  return members
    .filter((member) => member.userId !== currentUserId)
    .map((member) => member.name)
    .join(', ') || 'Direct chat'
}

export function toEvent(row: EventRow): ChatEvent {
  return {
    eventId: row.event_id as EventId,
    originNodeId: row.origin_node_id,
    originDeviceId: row.origin_device_id,
    actorUserId: row.actor_user_id,
    chatId: row.chat_id,
    type: row.type,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at,
    logicalClock: row.logical_clock,
    syncStatus: row.sync_status
  }
}

export function normaliseIncomingStatus(
  status: EventSyncStatus,
  nodeRole: 'central' | 'helper'
): EventSyncStatus {
  if (status === 'central-synced') return 'central-synced'
  return nodeRole === 'helper' ? 'helper-synced' : status
}
