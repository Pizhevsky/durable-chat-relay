import type { ChatId, MessageId, UserId } from '../../../shared/types'

export function uniqueUserIds(userIds: UserId[]): UserId[] {
  return Array.from(new Set(userIds))
}

export function canonicalDirectPairKey(...memberIds: UserId[]): string {
  return uniqueUserIds(memberIds).sort().join(':')
}

export function createChatId(): ChatId {
  return `chat-${crypto.randomUUID()}`
}

export function createMessageId(): MessageId {
  return `msg-${crypto.randomUUID()}`
}
