import type {
  ChatCreatedPayload,
  ChatEvent,
  ChatEventType,
  EventSyncStatus,
  MemberChangedPayload,
  MessageCreatedPayload,
  MessageReadPayload
} from '../../shared/types.js'
import { AppError } from '../errors.js'
import { canonicalDirectPairKey } from './chatEventFormatters.js'

const EVENT_TYPES = new Set<ChatEventType>([
  'chat.created',
  'member.added',
  'member.removed',
  'message.created',
  'message.read'
])

const SYNC_STATUSES = new Set<EventSyncStatus>([
  'local',
  'peer-replicated',
  'helper-synced',
  'central-synced',
  'conflict'
])

const MAX_TEXT_LENGTH = 2000
const MAX_TITLE_LENGTH = 120
const EVENT_ID_PATTERN = /^[^:\s]+:[^:\s]+$/
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

export function validateChatEvent(event: ChatEvent): void {
  if (!isRecord(event)) throw invalid('Event must be an object')

  requireString(event.eventId, 'eventId')
  if (!EVENT_ID_PATTERN.test(event.eventId)) {
    throw invalid('eventId must be in originDeviceId:eventId format')
  }
  requireString(event.originNodeId, 'originNodeId')
  requireString(event.originDeviceId, 'originDeviceId')
  requireString(event.actorUserId, 'actorUserId')
  requireString(event.chatId, 'chatId')
  requireString(event.createdAt, 'createdAt')

  if (!EVENT_TYPES.has(event.type)) throw invalid(`Unsupported event type: ${String(event.type)}`)
  if (!SYNC_STATUSES.has(event.syncStatus)) throw invalid(`Unsupported sync status: ${String(event.syncStatus)}`)
  if (!Number.isFinite(event.logicalClock) || event.logicalClock < 0) {
    throw invalid('logicalClock must be a non-negative finite number')
  }
  if (!ISO_DATE_TIME_PATTERN.test(event.createdAt) || Number.isNaN(Date.parse(event.createdAt))) {
    throw invalid('createdAt must be an ISO 8601 date string')
  }
  if (!isRecord(event.payload)) throw invalid('payload must be an object')

  switch (event.type) {
    case 'chat.created':
      validateChatCreated(event as ChatEvent<ChatCreatedPayload>)
      break
    case 'member.added':
    case 'member.removed':
      validateMemberChanged(event as ChatEvent<MemberChangedPayload>)
      break
    case 'message.created':
      validateMessageCreated(event as ChatEvent<MessageCreatedPayload>)
      break
    case 'message.read':
      validateMessageRead(event as ChatEvent<MessageReadPayload>)
      break
  }
}

function validateChatCreated(event: ChatEvent<ChatCreatedPayload>): void {
  const payload = event.payload
  validatePayloadChatId(event, payload.chatId)

  if (payload.type !== 'direct' && payload.type !== 'group') {
    throw invalid('chat.created payload type must be direct or group')
  }

  if (!Array.isArray(payload.memberIds) || payload.memberIds.length === 0) {
    throw invalid('chat.created memberIds must be a non-empty string array')
  }

  for (const memberId of payload.memberIds) requireString(memberId, 'memberIds[]')

  if (payload.title !== undefined && (typeof payload.title !== 'string' || payload.title.length > MAX_TITLE_LENGTH)) {
    throw invalid(`chat title must be a string no longer than ${MAX_TITLE_LENGTH} characters`)
  }

  if (payload.clientChatId !== undefined) requireString(payload.clientChatId, 'clientChatId')

  const uniqueMemberIds = Array.from(new Set([event.actorUserId, ...payload.memberIds]))
  if (payload.type === 'direct') {
    if (uniqueMemberIds.length !== 2) {
      throw invalid('direct chats must contain exactly two unique participants including the actor')
    }
    if (payload.directPairKey && payload.directPairKey !== canonicalDirectPairKey(uniqueMemberIds)) {
      throw invalid('directPairKey must match the canonical sorted participant key')
    }
  }

  if (payload.type === 'group' && uniqueMemberIds.length < 2) {
    throw invalid('group chats must contain at least two unique participants including the actor')
  }
}

function validateMemberChanged(event: ChatEvent<MemberChangedPayload>): void {
  const payload = event.payload
  validatePayloadChatId(event, payload.chatId)
  requireString(payload.memberId, 'memberId')
}

function validateMessageCreated(event: ChatEvent<MessageCreatedPayload>): void {
  const payload = event.payload
  validatePayloadChatId(event, payload.chatId)
  requireString(payload.messageId, 'messageId')
  requireString(payload.clientMessageId, 'clientMessageId')
  if (typeof payload.text !== 'string') {
    throw invalid('text must be a non-empty string')
  }

  const text = payload.text.trim()
  if (!text) throw invalid('message text cannot be empty')
  if (text.length > MAX_TEXT_LENGTH) {
    throw invalid(`message text cannot exceed ${MAX_TEXT_LENGTH} characters`)
  }
}

function validateMessageRead(event: ChatEvent<MessageReadPayload>): void {
  const payload = event.payload
  validatePayloadChatId(event, payload.chatId)
  requireString(payload.messageId, 'messageId')
}

function validatePayloadChatId(event: ChatEvent, payloadChatId: unknown): void {
  requireString(payloadChatId, 'payload.chatId')
  if (payloadChatId !== event.chatId) {
    throw invalid('event.chatId must match payload.chatId')
  }
}

function requireString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalid(`${fieldName} must be a non-empty string`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalid(message: string): AppError {
  return new AppError(message, 422, 'INVALID_EVENT')
}
