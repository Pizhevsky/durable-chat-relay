import type { ChatEvent, DeviceId, EventId } from '../../../../shared/types'
import type { PeerDataMessage } from './peerTypes'

export function encodePeerEvent(event: ChatEvent): string {
  return JSON.stringify({ type: 'event:new', event } satisfies PeerDataMessage)
}

export function encodePeerBatch(events: ChatEvent[]): string {
  return JSON.stringify({ type: 'event:batch', events } satisfies PeerDataMessage)
}

export function encodePeerAck(eventId: EventId, deviceId: DeviceId): string {
  return JSON.stringify({ type: 'event:ack', eventId, deviceId } satisfies PeerDataMessage)
}

export function encodePeerSummary(eventIds: EventId[], deviceId: DeviceId): string {
  return JSON.stringify({ type: 'event:summary', eventIds, deviceId } satisfies PeerDataMessage)
}

export function encodePeerMissingRequest(eventIds: EventId[], deviceId: DeviceId): string {
  return JSON.stringify({ type: 'event:request-missing', eventIds, deviceId } satisfies PeerDataMessage)
}

export function parsePeerMessage(value: unknown): PeerDataMessage | null {
  if (typeof value !== 'string') return null

  try {
    return toPeerDataMessage(JSON.parse(value))
  } catch (_error) {
    return null
  }
}

function toPeerDataMessage(value: unknown): PeerDataMessage | null {
  if (!value || typeof value !== 'object' || !('type' in value)) return null
  const data = value as { type?: unknown }

  if (data.type === 'event:new' && hasChatEvent(value, 'event')) {
    return { type: 'event:new', event: value.event }
  }
  if (data.type === 'event:batch' && hasChatEvents(value, 'events')) {
    return { type: 'event:batch', events: value.events }
  }
  if (data.type === 'event:ack' && hasEventId(value) && hasDeviceId(value)) {
    return { type: 'event:ack', eventId: value.eventId, deviceId: value.deviceId }
  }
  if (data.type === 'event:summary' && hasEventIds(value) && hasDeviceId(value)) {
    return { type: 'event:summary', eventIds: value.eventIds, deviceId: value.deviceId }
  }
  if (data.type === 'event:request-missing' && hasEventIds(value) && hasDeviceId(value)) {
    return { type: 'event:request-missing', eventIds: value.eventIds, deviceId: value.deviceId }
  }

  return null
}

function hasChatEvent<TProperty extends string>(
  value: object,
  property: TProperty
): value is Record<TProperty, ChatEvent> {
  const candidate = (value as Record<TProperty, unknown>)[property]
  return isChatEvent(candidate)
}

function hasChatEvents<TProperty extends string>(
  value: object,
  property: TProperty
): value is Record<TProperty, ChatEvent[]> {
  const candidate = (value as Record<TProperty, unknown>)[property]
  return Array.isArray(candidate) && candidate.every(isChatEvent)
}

function hasEventId(value: object): value is { eventId: EventId } {
  return typeof (value as { eventId?: unknown }).eventId === 'string'
}

function hasEventIds(value: object): value is { eventIds: EventId[] } {
  const eventIds = (value as { eventIds?: unknown }).eventIds
  return Array.isArray(eventIds) && eventIds.every((eventId) => typeof eventId === 'string')
}

function hasDeviceId(value: object): value is { deviceId: DeviceId } {
  return typeof (value as { deviceId?: unknown }).deviceId === 'string'
}

function isChatEvent(value: unknown): value is ChatEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<ChatEvent>
  return typeof event.eventId === 'string' && typeof event.chatId === 'string' && typeof event.type === 'string'
}
