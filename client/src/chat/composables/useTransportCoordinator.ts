import type { Ref } from 'vue'
import type { AppConfig, ChatEvent, DeviceId } from '../../../../shared/types'
import type { ChatBrowserActions } from '../actions/chatBrowser'
import { errorMessage } from '../errorMessage'
import { reconcileDirectChatConfirmation } from '../events/directChatReconciliation'
import type { ChatState } from './useChatState'
import { useAutomaticCentralReconnect } from './useAutomaticCentralReconnect'
import { useOutboxSync } from './useOutboxSync'
import { usePeerReplication } from './usePeerReplication'
import { useSocketConnection } from './useSocketConnection'

type AppliedChatEvent = Parameters<ChatState['applyEvent']>[0]

interface TransportCoordinatorInput {
  state: ChatState
  deviceId: DeviceId
  localTransportPaused: Ref<boolean>
  browserActions: ChatBrowserActions
  applyConfig: (config: AppConfig) => void
  loadConfig: () => Promise<AppConfig>
  loadUsers: () => Promise<void>
  refreshChats: () => Promise<void>
  loadActiveMessages: () => Promise<void>
  persistVisibleState: (chatId?: string | null) => Promise<void>
  publishLocalEvent: (event: ChatEvent) => void
  handleAppliedEvent: (event: AppliedChatEvent, options: { rebroadcast: boolean }) => Promise<void>
}

export function useTransportCoordinator(input: TransportCoordinatorInput) {
  const { state } = input
  let retryPendingAfterConnect: (() => Promise<void>) | null = null

  const socket = useSocketConnection({
    deviceId: input.deviceId,
    getUserId: () => state.currentUserId.value,
    onConnectionLabel: (label) => {
      state.connectionLabel.value = label
    },
    onConnected: () => {
      if (input.localTransportPaused.value) return
      retryPendingAfterConnect?.().catch((error: unknown) => {
        state.lastError.value = errorMessage(error, 'Failed to retry pending events')
      })
    },
    onChats: (chats) => {
      state.setChats(chats)
      syncPeerTargets()
      input.persistVisibleState().catch(() => undefined)
      input.browserActions.openChatFromUrlIfPossible()
      input.loadActiveMessages().catch((error: unknown) => {
        state.lastError.value = errorMessage(error, 'Failed to load messages')
      })
    },
    onEvent: async (event) => {
      await input.handleAppliedEvent(event, { rebroadcast: true })
    },
    onPeerSignal: (message) => {
      peerReplication.handleSignal(message).catch((error: unknown) => {
        state.lastError.value = errorMessage(error, 'Failed to handle WebRTC signal')
      })
    },
    onPeerDirectory: (directory) => {
      state.setPeerDirectory(directory.peers)
      syncPeerTargets()
    },
    onPresence: (presence) => {
      state.setPresence(presence)
      syncPeerTargets()
    }
  })

  const peerReplication = usePeerReplication({
    state,
    deviceId: input.deviceId,
    localTransportPaused: input.localTransportPaused,
    sendSignal: socket.sendPeerSignal,
    onEventAccepted: async (event) => {
      await input.handleAppliedEvent(event, { rebroadcast: true })
      if (socket.isConnected()) {
        outbox.retryPending().catch((error: unknown) => {
          state.lastError.value = errorMessage(error, 'Failed to sync peer event to central')
        })
      }
    }
  })

  const outbox = useOutboxSync({
    getUserId: () => state.currentUserId.value,
    publishOnline: socket.publishEvent,
    syncReplicated: socket.syncEvents,
    onEventConfirmed: async (confirmed, original) => {
      const result = await reconcileDirectChatConfirmation(state, confirmed, original)
      state.applyEvent(confirmed)
      input.persistVisibleState(confirmed.chatId).catch(() => undefined)
      input.publishLocalEvent(confirmed)
      publishPeerEvent(confirmed)
      return result
    },
    onPendingCount: (count) => {
      state.pendingCount.value = count
    },
    onEventSaved: async (event) => {
      if (!socket.isConnected()) publishPeerEvent(event)
    }
  })
  retryPendingAfterConnect = outbox.retryPending

  const centralReconnect = useAutomaticCentralReconnect({
    applyConfig: input.applyConfig,
    loadConfig: input.loadConfig,
    loadUsers: input.loadUsers,
    connect: socket.connect,
    refreshChats: input.refreshChats,
    loadActiveMessages: input.loadActiveMessages,
    refreshPendingCount: outbox.refreshPendingCount,
    syncPeerTargets,
    onError: (error: unknown) => {
      state.lastError.value = errorMessage(error, 'Failed to reconnect to central')
    }
  })

  function syncPeerTargets(): void {
    peerReplication.syncTargets()
  }

  function publishPeerEvent(event: AppliedChatEvent): void {
    peerReplication.publishEvent(event)
  }

  function close(): void {
    centralReconnect.stop()
    socket.close()
    peerReplication.close()
  }

  return {
    socket,
    outbox,
    centralReconnect,
    peerReplication,
    syncPeerTargets,
    publishPeerEvent,
    close
  }
}
