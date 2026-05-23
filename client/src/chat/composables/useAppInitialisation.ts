import type { AppConfig } from '../../../../shared/types'
import type { ChatBrowserActions } from '../actions/chatBrowser'
import type { ChatState } from './useChatState'

interface AppInitialisationInput {
  state: ChatState
  loadConfig: () => Promise<AppConfig>
  applyConfig: (config: AppConfig) => void
  loadUsers: () => Promise<void>
  connect: (config: AppConfig) => void
  refreshChats: () => Promise<void>
  syncPeerTargets: () => void
  initialisePush: () => Promise<void>
  browserActions: ChatBrowserActions
  refreshPendingCount: () => Promise<void>
  startCentralReconnect: () => void
}

export function useAppInitialisation(input: AppInitialisationInput) {
  async function initialise(): Promise<void> {
    const config = await input.loadConfig()
    input.applyConfig(config)

    await input.loadUsers()
    input.connect(config)
    await input.refreshChats()
    input.syncPeerTargets()
    await input.initialisePush()
    input.browserActions.bindServiceWorkerMessages()
    input.browserActions.syncUserIdentity(input.state.currentUserId.value)
    input.browserActions.openChatFromUrlIfPossible()
    await input.refreshPendingCount()
    input.startCentralReconnect()
  }

  return {
    initialise
  }
}
