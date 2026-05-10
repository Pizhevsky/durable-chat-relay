import type { ChatMember, EventSyncStatus } from '../../../shared/types'

export const DIRECT_CHAT_FALLBACK_TITLE = 'Direct chat'
export const GROUP_CHAT_FALLBACK_TITLE = 'Group chat'
export const EMPTY_READ_RECEIPT_LABEL = 'not read yet'
export const LOCAL_ONLY_CLOSE_WARNING =
  'This tab is in local-only mode. Your messages are saved here, ' +
  'but disconnected users will see them only after this browser opens again and syncs.'

export function namesExceptCurrentUser(members: ChatMember[], currentUserId: string): string[] {
  return members
    .filter((member) => member.userId !== currentUserId)
    .map((member) => member.name)
}

export function directChatTitle(members: ChatMember[], currentUserId: string): string {
  return namesExceptCurrentUser(members, currentUserId).join(', ') || DIRECT_CHAT_FALLBACK_TITLE
}

export function participantDescription(members: ChatMember[], currentUserId: string): string {
  return namesExceptCurrentUser(members, currentUserId).join(', ') || 'Only you'
}

export function readReceiptLabel(members: ChatMember[], readBy: string[], currentUserId: string): string {
  const readerNames = members
    .filter((member) => member.userId !== currentUserId && readBy.includes(member.userId))
    .map((member) => member.name)

  return readerNames.length > 0 ? `read by ${readerNames.join(', ')}` : EMPTY_READ_RECEIPT_LABEL
}

export function syncStatusLabel(status?: EventSyncStatus): string {
  switch (status) {
    case 'central-synced':
      return 'Central synced'
    case 'helper-synced':
      return 'Helper synced'
    case 'peer-replicated':
      return 'Peer replicated'
    case 'local':
      return 'Local only'
    case 'conflict':
      return 'Conflict'
    default:
      return 'Pending retry'
  }
}

export function syncStatusClass(status?: EventSyncStatus): string {
  switch (status) {
    case 'central-synced':
      return 'status-central'
    case 'helper-synced':
      return 'status-helper'
    case 'peer-replicated':
      return 'status-peer'
    case 'local':
      return 'status-local'
    case 'conflict':
      return 'status-conflict'
    default:
      return 'status-pending'
  }
}
