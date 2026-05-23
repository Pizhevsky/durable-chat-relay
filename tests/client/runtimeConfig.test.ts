import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clientConfig } from '../../client/src/config/clientConfig'
import { api } from '../../client/src/services/api'
import {
  apiOrigin,
  apiUrl,
  clearAutomaticDevHelperOverride,
  devHelperApiOrigin,
  isDevCentralApiAvailable,
  isUsingAutomaticDevHelperFallback,
  storeApiOverride
} from '../../client/src/services/runtimeConfig'

const helperApiOrigin = `http://localhost:${clientConfig.devHelperApiPort}`
const originalLocation = window.location

describe('runtime API config', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.pushState({}, '', '/')
    vi.restoreAllMocks()
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation
    })
    vi.unstubAllGlobals()
  })

  it('uses the current origin by default outside the Parcel dev client', () => {
    expect(apiOrigin()).toBe(window.location.origin)
  })

  it('stores an API override from the query string for helper-node demos', () => {
    window.history.pushState({}, '', `/?${clientConfig.apiOverrideQueryParam}=${helperApiOrigin}`)

    expect(apiOrigin()).toBe(helperApiOrigin)
    expect(localStorage.getItem(clientConfig.storageKeys.apiOverride)).toBe(helperApiOrigin)
    expect(apiUrl('/api/users')).toBe(`${helperApiOrigin}/api/users`)
  })

  it('uses the stored API override on later page loads', () => {
    localStorage.setItem(clientConfig.storageKeys.apiOverride, helperApiOrigin)

    expect(apiOrigin()).toBe(helperApiOrigin)
  })

  it('falls back to the helper API when the dev central API is unavailable', async () => {
    setWindowLocation('http://localhost:1234/')

    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(Response.json({ nodeRole: 'helper', nodeId: 'helper-demo' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.config()).resolves.toEqual({ nodeRole: 'helper', nodeId: 'helper-demo' })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `http://localhost:${clientConfig.devApiPort}/api/config`,
      expect.any(Object)
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${helperApiOrigin}/api/config`,
      expect.any(Object)
    )
    expect(localStorage.getItem(clientConfig.storageKeys.apiOverride)).toBe(helperApiOrigin)
    expect(isUsingAutomaticDevHelperFallback()).toBe(true)
  })

  it('does not clear a manually selected helper API as an automatic fallback', () => {
    storeApiOverride(devHelperApiOrigin())

    clearAutomaticDevHelperOverride()

    expect(apiOrigin()).toBe(helperApiOrigin)
    expect(isUsingAutomaticDevHelperFallback()).toBe(false)
  })

  it('detects when the dev central API is available', async () => {
    setWindowLocation('http://localhost:1234/')
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(isDevCentralApiAvailable()).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:${clientConfig.devApiPort}/api/health`,
      { cache: 'no-store' }
    )
  })
})

function setWindowLocation(url: string): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(url)
  })
}
