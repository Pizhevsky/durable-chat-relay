import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AppConfig } from '../../../../shared/types'
import { clientConfig } from '../../config/clientConfig'
import { api } from '../../services/api'
import { getDeviceId } from '../../services/device'
import { createLocalEventBus } from '../../services/realtime/localEventBus'
import { downloadRecoveryDump, readRecoveryDump } from '../../services/recoveryFiles'
import { exportRecoveryDump, importRecoveryDump } from '../../storage/localDb'
import { createChatActions } from '../actions/chatActions'
import { createChatBrowserActions } from '../actions/chatBrowser'
import { errorMessage } from '../errorMessage'
import { reconcileDirectChatConfirmation } from '../events/directChatReconciliation'
import { createChatPersistence } from '../persistence/chatPersistence'
import { useChatState } from './useChatState'
import { useOutboxSync } from './useOutboxSync'
import { usePeerReplication } from './usePeerReplication'
import { usePushNotifications } from './usePushNotifications'
import { useSocketConnection } from './useSocketConnection'

type AppliedChatEvent = Parameters<ReturnType<typeof useChatState>['applyEvent']>[0]

export function useDurableChatApp() {
  const state = useChatState()
  const push = usePushNotifications()
  const deviceId = getDeviceId()
  const localTransportPaused = ref(false)
  let nodeId = `browser-${deviceId.slice(0, clientConfig.browserNodeIdPrefixLength)}`
  let appConfig: AppConfig | null = null
  let retryPendingAfterConnect: (() => Promise<void>) | null = null
  let peerReplication: ReturnType<typeof usePeerReplication> | null = null

  const persistence = createChatPersistence({
    state,
    fallbackNodeId: () => nodeId
  })

  const localEventBus = createLocalEventBus({
    getUserId: () => state.currentUserId.value,
    onEvent: (event) => {
      handleAppliedEvent(event, { rebroadcast: false }).catch((error: unknown) => {
        state.lastError.value = errorMessage(error, 'Failed to apply local tab event')
      })
    }
  })

  const browserActions = createChatBrowserActions({
    state,
    openChat
  })

  const socket = useSocketConnection({
    deviceId,
    getUserId: () => state.currentUserId.value,
    onConnectionLabel: (label) => {
      state.connectionLabel.value = label
    },
    onConnected: () => {
      if (localTransportPaused.value) return
      retryPendingAfterConnect?.().catch((error: unknown) => {
        state.lastError.value = errorMessage(error, 'Failed to retry pending events')
      })
    },
    onChats: (chats) => {
      state.setChats(chats)
      syncPeerTargets()
      persistence.persistVisibleState().catch(() => undefined)
      browserActions.openChatFromUrlIfPossible()
      persistence.loadActiveMessages().catch((error: unknown) => {
        state.lastError.value = errorMessage(error, 'Failed to load messages')
      })
    },
    onEvent: async (event) => {
      await handleAppliedEvent(event, { rebroadcast: true })
    },
    onPeerSignal: (message) => {
      peerReplication?.handleSignal(message).catch((error: unknown) => {
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

  peerReplication = usePeerReplication({
    state,
    deviceId,
    localTransportPaused,
    sendSignal: socket.sendPeerSignal,
    onEventAccepted: async (event) => {
      await handleAppliedEvent(event, { rebroadcast: true })
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
      persistence.persistVisibleState(confirmed.chatId).catch(() => undefined)
      localEventBus.publish(confirmed)
      publishPeerEvent(confirmed)
      return result
    },
    onPendingCount: (count) => {
      state.pendingCount.value = count
    }
  })
  retryPendingAfterConnect = outbox.retryPending

  const actions = createChatActions({
    state,
    deviceId,
    nodeId: () => nodeId,
    openChat,
    refreshChats: persistence.refreshChats,
    persistVisibleState: persistence.persistVisibleState,
    saveAndSend: async (event) => {
      if (!socket.isConnected()) publishPeerEvent(event)
      await outbox.saveAndSend(event)
    }
  })

  async function initialise(): Promise<void> {
    const config = await persistence.loadConfig()
    appConfig = config
    nodeId = config.nodeId

    await persistence.loadUsers()
    socket.connect(config)
    await persistence.refreshChats()
    syncPeerTargets()
    await push.initialise()
    browserActions.bindServiceWorkerMessages()
    browserActions.openChatFromUrlIfPossible()
    await outbox.refreshPendingCount()
  }

  async function openChat(chatId: string): Promise<void> {
    state.activeChatId.value = chatId
    browserActions.updateChatQueryParam(chatId)
    await persistence.loadActiveMessages()
    await actions.markActiveMessagesRead()
  }

  async function handleAppliedEvent(
    event: AppliedChatEvent,
    options: { rebroadcast: boolean }
  ): Promise<void> {
    const result = state.applyEvent(event)
    if (event.type === 'chat.created' || event.type === 'member.added' || event.type === 'member.removed') {
      syncPeerTargets()
    }
    if (options.rebroadcast) {
      localEventBus.publish(event)
      publishPeerEvent(event)
    }
    if (result.message && event.actorUserId !== state.currentUserId.value) {
      push.notifyFromForeground(result.message, state.currentUserId.value)
    }
    await persistence.persistVisibleState(event.chatId)
    if (result.needsRefresh) await persistence.refreshChats()
    if (event.chatId === state.activeChatId.value) {
      actions.markActiveMessagesRead().catch((error: unknown) => {
        state.lastError.value = errorMessage(error, 'Failed to mark messages as read')
      })
    }
  }

  async function changeUser(userId: string): Promise<void> {
    state.setCurrentUser(userId)
    socket.reconnectUser()
    await persistence.refreshChats()
    syncPeerTargets()
    await persistence.loadActiveMessages()
    await actions.markActiveMessagesRead()
  }

  function syncPeerTargets(): void {
    peerReplication?.syncTargets()
  }

  function publishPeerEvent(event: AppliedChatEvent): void {
    peerReplication?.publishEvent(event)
  }

  async function exportDump(): Promise<void> {
    const dump = await exportRecoveryDump(state.currentUserId.value, deviceId)
    downloadRecoveryDump(dump)
  }

  async function importDump(file: File): Promise<void> {
    const dump = await readRecoveryDump(file)
    await importRecoveryDump(dump)
    await api.importRecovery(dump)
    await outbox.retryPending()
    await persistence.refreshChats()
  }

  async function pauseOnlineTransport(): Promise<void> {
    localTransportPaused.value = true
    socket.setLocalTransportPaused(true)
    await outbox.refreshPendingCount()
  }

  async function resumeOnlineTransport(): Promise<void> {
    localTransportPaused.value = false
    socket.setLocalTransportPaused(false)
  }

  async function requestNotifications(): Promise<void> {
    await push.requestPermission()
  }

  async function showNotificationPreview(): Promise<void> {
    try {
      await push.showNotificationPreview()
    } catch (error: unknown) {
      state.lastError.value = errorMessage(error, 'Notification test failed')
    }
  }

  watch(() => state.activeChatId.value, () => {
    persistence.loadActiveMessages()
      .then(actions.markActiveMessagesRead)
      .catch(() => undefined)
  })

  onMounted(() => {
    initialise().catch((error: unknown) => {
      state.lastError.value = errorMessage(error, 'Failed to initialise chat')
      state.connectionLabel.value = 'Offline, saving locally'
    })
  })

  onBeforeUnmount(() => {
    socket.close()
    browserActions.close()
    push.close()
    localEventBus.close()
    peerReplication?.close()
  })

  return {
    ...state,
    deviceId,
    nodeId: () => appConfig?.nodeId ?? nodeId,
    notificationPermission: push.permission,
    notificationStatus: push.lastNotificationStatus,
    inAppNotification: push.inAppNotification,
    localTransportPaused,
    openChat,
    changeUser,
    createDirectChat: actions.createDirectChat,
    createGroupChat: actions.createGroupChat,
    sendMessage: actions.sendMessage,
    retryPending: outbox.retryPending,
    exportDump,
    importDump,
    pauseOnlineTransport,
    resumeOnlineTransport,
    requestNotifications,
    showNotificationPreview
  }
}

export type DurableChatApp = ReturnType<typeof useDurableChatApp>
