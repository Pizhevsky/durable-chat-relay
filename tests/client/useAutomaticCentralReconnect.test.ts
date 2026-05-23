import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../../shared/types'
import { useAutomaticCentralReconnect } from '../../client/src/chat/composables/useAutomaticCentralReconnect'
import { clientConfig } from '../../client/src/config/clientConfig'
import { storeAutomaticDevHelperOverride } from '../../client/src/services/runtimeConfig'

const originalLocation = window.location

describe('useAutomaticCentralReconnect', () => {
  beforeEach(() => {
    localStorage.clear()
    setWindowLocation('http://localhost:1234/')
    vi.restoreAllMocks()
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation
    })
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('checks for central immediately after starting', async () => {
    storeAutomaticDevHelperOverride()
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const applyConfig = vi.fn()
    const loadUsers = vi.fn(async () => undefined)
    const connect = vi.fn()
    const refreshChats = vi.fn(async () => undefined)
    const loadActiveMessages = vi.fn(async () => undefined)
    const refreshPendingCount = vi.fn(async () => undefined)
    const syncPeerTargets = vi.fn()
    const onError = vi.fn()
    const centralConfig: AppConfig = { nodeRole: 'central', nodeId: 'central-demo' }

    const reconnect = useAutomaticCentralReconnect({
      applyConfig,
      loadConfig: vi.fn(async () => centralConfig),
      loadUsers,
      connect,
      refreshChats,
      loadActiveMessages,
      refreshPendingCount,
      syncPeerTargets,
      onError
    })

    reconnect.start()

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:${clientConfig.devApiPort}/api/health`,
        { cache: 'no-store' }
      )
      expect(connect).toHaveBeenCalledWith(centralConfig)
    })

    reconnect.stop()
    expect(onError).not.toHaveBeenCalled()
  })
})

function setWindowLocation(url: string): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(url)
  })
}
