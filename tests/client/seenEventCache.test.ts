import { describe, expect, it } from 'vitest'
import { createSeenEventCache } from '../../client/src/services/realtime/seenEventCache'

describe('seen event cache', () => {
  it('remembers event IDs and clears them', () => {
    const cache = createSeenEventCache(3)

    expect(cache.has('device-a:event-1')).toBe(false)
    cache.remember('device-a:event-1')
    expect(cache.has('device-a:event-1')).toBe(true)

    cache.clear()
    expect(cache.has('device-a:event-1')).toBe(false)
  })

  it('keeps the cache bounded by evicting the oldest event ID', () => {
    const cache = createSeenEventCache(2)

    cache.remember('device-a:event-1')
    cache.remember('device-a:event-2')
    cache.remember('device-a:event-3')

    expect(cache.has('device-a:event-1')).toBe(false)
    expect(cache.has('device-a:event-2')).toBe(true)
    expect(cache.has('device-a:event-3')).toBe(true)
  })

  it('does not move an already remembered event to the newest position', () => {
    const cache = createSeenEventCache(2)

    cache.remember('device-a:event-1')
    cache.remember('device-a:event-2')
    cache.remember('device-a:event-1')
    cache.remember('device-a:event-3')

    expect(cache.has('device-a:event-1')).toBe(false)
    expect(cache.has('device-a:event-2')).toBe(true)
    expect(cache.has('device-a:event-3')).toBe(true)
  })
})
