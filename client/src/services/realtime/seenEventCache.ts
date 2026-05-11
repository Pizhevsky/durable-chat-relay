import type { EventId } from '../../../../shared/types'

export interface SeenEventCache {
  has: (eventId: EventId) => boolean
  remember: (eventId: EventId) => void
  clear: () => void
}

export function createSeenEventCache(limit: number): SeenEventCache {
  const events = new Set<EventId>()
  const eventOrder: EventId[] = []

  function remember(eventId: EventId): void {
    if (events.has(eventId)) return

    events.add(eventId)
    eventOrder.push(eventId)

    while (eventOrder.length > limit) {
      const oldestEventId = eventOrder.shift()
      if (oldestEventId) events.delete(oldestEventId)
    }
  }

  function clear(): void {
    events.clear()
    eventOrder.length = 0
  }

  return {
    has: (eventId) => events.has(eventId),
    remember,
    clear
  }
}
