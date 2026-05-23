import type { AppConfig } from '../../../../shared/types'
import { clientConfig } from '../../config/clientConfig'
import {
  clearAutomaticDevHelperOverride,
  isDevCentralApiAvailable,
  isUsingAutomaticDevHelperFallback
} from '../../services/runtimeConfig'

interface AutomaticCentralReconnectInput {
  applyConfig: (config: AppConfig) => void
  loadConfig: () => Promise<AppConfig>
  loadUsers: () => Promise<void>
  connect: (config: AppConfig) => void
  refreshChats: () => Promise<void>
  loadActiveMessages: () => Promise<void>
  refreshPendingCount: () => Promise<void>
  syncPeerTargets: () => void
  onError: (error: unknown) => void
}

export function useAutomaticCentralReconnect(input: AutomaticCentralReconnectInput) {
  let timer: number | null = null
  let switchingToCentral = false

  function start(): void {
    if (timer) return

    reconnectIfAvailable().catch(input.onError)
    timer = window.setInterval(() => {
      reconnectIfAvailable().catch(input.onError)
    }, clientConfig.devCentralReconnectProbeMs)
  }

  function stop(): void {
    if (!timer) return

    window.clearInterval(timer)
    timer = null
  }

  async function reconnectIfAvailable(): Promise<void> {
    if (switchingToCentral || !isUsingAutomaticDevHelperFallback()) return
    if (!await isDevCentralApiAvailable()) return
    if (!isUsingAutomaticDevHelperFallback()) return

    switchingToCentral = true
    try {
      clearAutomaticDevHelperOverride()
      const config = await input.loadConfig()
      input.applyConfig(config)

      await input.loadUsers()
      input.connect(config)
      await input.refreshChats()
      await input.loadActiveMessages()
      input.syncPeerTargets()
      await input.refreshPendingCount()
    } finally {
      switchingToCentral = false
    }
  }

  return {
    start,
    stop
  }
}
