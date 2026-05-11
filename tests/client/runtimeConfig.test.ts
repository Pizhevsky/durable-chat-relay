import { beforeEach, describe, expect, it } from 'vitest'
import { clientConfig } from '../../client/src/config/clientConfig'
import { apiOrigin, apiUrl } from '../../client/src/services/runtimeConfig'

const helperApiOrigin = `http://localhost:${clientConfig.devHelperApiPort}`

describe('runtime API config', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.pushState({}, '', '/')
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
})
