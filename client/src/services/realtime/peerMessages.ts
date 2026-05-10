import type { ChatEvent } from '../../../../shared/types'
import type { PeerDataMessage } from './peerTypes'

export function encodePeerEvent(event: ChatEvent): string {
  return JSON.stringify({ type: 'event:new', event } satisfies PeerDataMessage)
}

export function encodePeerBatch(events: ChatEvent[]): string {
  return JSON.stringify({ type: 'event:batch', events } satisfies PeerDataMessage)
}

export function encodePeerAck(eventId: string, deviceId: string): string {
  return JSON.stringify({ type: 'event:ack', eventId, deviceId } satisfies PeerDataMessage)
}

export function encodePeerSummary(eventIds: string[], deviceId: string): string {
  return JSON.stringify({ type: 'event:summary', eventIds, deviceId } satisfies PeerDataMessage)
}

export function encodePeerMissingRequest(eventIds: string[], deviceId: string): string {
  return JSON.stringify({ type: 'event:request-missing', eventIds, deviceId } satisfies PeerDataMessage)
}

export function parsePeerMessage(value: unknown): PeerDataMessage | null {
  if (typeof value !== 'string') return null

  try {
    const data = JSON.parse(value) as Partial<PeerDataMessage>
    if (data.type === 'event:new' && data.event?.eventId) return data as PeerDataMessage
    if (data.type === 'event:batch' && Array.isArray(data.events)) return data as PeerDataMessage
    if (data.type === 'event:ack' && data.eventId && data.deviceId) return data as PeerDataMessage
    if (data.type === 'event:summary' && Array.isArray(data.eventIds) && data.deviceId) return data as PeerDataMessage
    if (data.type === 'event:request-missing' && Array.isArray(data.eventIds) && data.deviceId) {
      return data as PeerDataMessage
    }
  } catch (_error) {
    return null
  }

  return null
}
