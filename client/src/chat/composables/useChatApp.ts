import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AppConfig } from '../../../../shared/types'
import { api } from '../../services/api'
import { getDeviceId } from '../../services/device'
import { createLocalEventBus } from '../../services/realtime/localEventBus'
import { downloadRecoveryDump, readRecoveryDump } from '../../services/recoveryFiles'
import { exportRecoveryDump, importRecoveryDump } from '../../storage/localDb'
import { LOCAL_ONLY_CLOSE_WARNING } from '../../utils/chatLabels'
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

const LOCAL_ONLY_SESSION_KEY = 'durable-chat-local-only'

export function useChatApp() {
  const state = useChatState()
  const push = usePushNotifications()
  const deviceId = getDeviceId()
  const demoLocalOnly = ref(false)
  let nodeId = `browser-${deviceId.slice(0, 8)}`
  let appConfig: AppConfig | null = null
  let retryPendingAfterConnect: (() => Promise<void>) | null = null
  let peerReplication: ReturnType<typeof usePeerReplication> | null = null

  const persistence = createChatPersistence({
    state,
    fallbackNodeId: () => nodeId
  })

  const localEventBus = createLocalEventBus((event) => {
    handleAppliedEvent(event, { rebroadcast: false }).catch((error: unknown) => {
      state.lastError.value = errorMessage(error, 'Failed to apply local tab event')
    })
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
      if (demoLocalOnly.value) return
      demoLocalOnly.value = false
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
    onPresence: (presence) => {
      state.setPresence(presence)
      syncPeerTargets()
    }
  })

  peerReplication = usePeerReplication({
    state,
    deviceId,
    demoLocalOnly,
    sendSignal: socket.sendPeerSignal,
    onEventAccepted: async (event) => {
      await handleAppliedEvent(event, { rebroadcast: true })
    }
  })

  const outbox = useOutboxSync({
    publishOnline: socket.publishEvent,
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

    if (sessionStorage.getItem(LOCAL_ONLY_SESSION_KEY) === '1') {
      demoLocalOnly.value = true
      socket.setDemoLocalOnly(true)
    }
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
      push.notifyFromForeground(result.message)
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

  async function enableDemoLocalOnly(): Promise<void> {
    demoLocalOnly.value = true
    sessionStorage.setItem(LOCAL_ONLY_SESSION_KEY, '1')
    socket.setDemoLocalOnly(true)
    await outbox.refreshPendingCount()
  }

  async function disableDemoLocalOnly(): Promise<void> {
    demoLocalOnly.value = false
    sessionStorage.removeItem(LOCAL_ONLY_SESSION_KEY)
    socket.setDemoLocalOnly(false)
  }

  async function requestNotifications(): Promise<void> {
    await push.requestPermission()
  }

  async function showDemoNotification(): Promise<void> {
    try {
      await push.showDemoNotification()
    } catch (error: unknown) {
      state.lastError.value = errorMessage(error, 'Notification test failed')
    }
  }

  function warnBeforeLocalOnlyClose(event: BeforeUnloadEvent): string | undefined {
    if (!demoLocalOnly.value) return undefined

    event.preventDefault()
    // Browsers require returnValue to trigger the prompt, but most modern UAs
    // show generic text instead of this app-specific warning.
    event.returnValue = LOCAL_ONLY_CLOSE_WARNING
    return LOCAL_ONLY_CLOSE_WARNING
  }

  watch(() => state.activeChatId.value, () => {
    persistence.loadActiveMessages()
      .then(actions.markActiveMessagesRead)
      .catch(() => undefined)
  })

  onMounted(() => {
    window.addEventListener('beforeunload', warnBeforeLocalOnlyClose)
    initialise().catch((error: unknown) => {
      state.lastError.value = errorMessage(error, 'Failed to initialise chat')
      state.connectionLabel.value = 'Offline, saving locally'
    })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', warnBeforeLocalOnlyClose)
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
    demoLocalOnly,
    openChat,
    changeUser,
    createDirectChat: actions.createDirectChat,
    createGroupChat: actions.createGroupChat,
    sendMessage: actions.sendMessage,
    retryPending: outbox.retryPending,
    exportDump,
    importDump,
    enableDemoLocalOnly,
    disableDemoLocalOnly,
    requestNotifications,
    showDemoNotification,
    openDemoUser: browserActions.openDemoUser
  }
}

export type ChatApp = ReturnType<typeof useChatApp>
