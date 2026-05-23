import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clientConfig } from '../../client/src/config/clientConfig'
import { getDeviceId } from '../../client/src/services/device'

describe('browser device identity', () => {
  beforeEach(() => {
    sessionStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('keeps a stable device id within one browser window session', () => {
    const first = getDeviceId()
    const second = getDeviceId()

    expect(second).toBe(first)
    expect(sessionStorage.getItem(clientConfig.storageKeys.deviceId)).toBe(first)
  })

  it('creates a fresh device and clears the copied logical clock for demo user windows', () => {
    sessionStorage.setItem(clientConfig.storageKeys.deviceId, 'browser-existing')
    sessionStorage.setItem(clientConfig.storageKeys.logicalClock, '7')
    window.history.pushState({}, '', `/?${clientConfig.newDeviceQueryParam}=1&user=u-anna`)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')

    expect(getDeviceId()).toBe('browser-00000000-0000-4000-8000-000000000001')
    expect(sessionStorage.getItem(clientConfig.storageKeys.logicalClock)).toBeNull()
    expect(window.location.search).toBe('?user=u-anna')
  })
})
