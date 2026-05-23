import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AppConfig } from '../../../../shared/types'
import { clientConfig } from '../../config/clientConfig'
import { getDeviceId } from '../../services/device'
import { createLocalEventBus } from '../../services/realtime/localEventBus'
import type { ChatActions } from '../actions/chatActions'
import { createChatActions } from '../actions/chatActions'
import { createChatBrowserActions } from '../actions/chatBrowser'
import { errorMessage } from '../errorMessage'
import { createChatPersistence } from '../persistence/chatPersistence'
import { useAppInitialisation } from './useAppInitialisation'
import { useAppliedEventPipeline } from './useAppliedEventPipeline'
import { useChatState } from './useChatState'
import { useDocumentTitle } from './useDocumentTitle'
import { usePushNotifications } from './usePushNotifications'
import { useRecoveryActions } from './useRecoveryActions'
import { useTransportCoordinator } from './useTransportCoordinator'
import { useUserSession } from './useUserSession'

type AppliedChatEvent = Parameters<ReturnType<typeof useChatState>['applyEvent']>[0]

export function useDurableChatApp() {
  const state = useChatState()
  const push = usePushNotifications()
  const deviceId = getDeviceId()
  const localTransportPaused = ref(false)
  let nodeId = `browser-${deviceId.slice(0, clientConfig.browserNodeIdPrefixLength)}`
  let appConfig: AppConfig | null = null
  let actions: ChatActions
  let userSession: ReturnType<typeof useUserSession>
  let eventPipeline: ReturnType<typeof useAppliedEventPipeline>

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
    openChat,
    ensureUser: changeUser
  })

  const transport = useTransportCoordinator({
    state,
    deviceId,
    localTransportPaused,
    browserActions,
    applyConfig,
    loadConfig: persistence.loadConfig,
    loadUsers: persistence.loadUsers,
    refreshChats: persistence.refreshChats,
    loadActiveMessages: persistence.loadActiveMessages,
    persistVisibleState: persistence.persistVisibleState,
    publishLocalEvent: localEventBus.publish,
    handleAppliedEvent
  })

  actions = createChatActions({
    state,
    deviceId,
    nodeId: () => nodeId,
    openChat,
    refreshChats: persistence.refreshChats,
    persistVisibleState: persistence.persistVisibleState,
    saveAndSend: transport.outbox.saveAndSend
  })

  userSession = useUserSession({
    state,
    browserActions,
    peerReplication: () => transport.peerReplication,
    reconnectUser: transport.socket.reconnectUser,
    refreshChats: persistence.refreshChats,
    loadActiveMessages: persistence.loadActiveMessages,
    syncPeerTargets: transport.syncPeerTargets,
    actions: () => actions
  })

  eventPipeline = useAppliedEventPipeline({
    state,
    publishLocalEvent: localEventBus.publish,
    publishPeerEvent: transport.publishPeerEvent,
    notifyFromForeground: push.notifyFromForeground,
    persistVisibleState: persistence.persistVisibleState,
    refreshChats: persistence.refreshChats,
    markActiveMessagesRead: () => actions.markActiveMessagesRead(),
    syncPeerTargets: transport.syncPeerTargets
  })

  const initialisation = useAppInitialisation({
    state,
    loadConfig: persistence.loadConfig,
    applyConfig,
    loadUsers: persistence.loadUsers,
    connect: transport.socket.connect,
    refreshChats: persistence.refreshChats,
    syncPeerTargets: transport.syncPeerTargets,
    initialisePush: push.initialise,
    browserActions,
    refreshPendingCount: transport.outbox.refreshPendingCount,
    startCentralReconnect: transport.centralReconnect.start
  })

  const recoveryActions = useRecoveryActions({
    state,
    deviceId,
    refreshChats: persistence.refreshChats,
    retryPending: transport.outbox.retryPending
  })

  useDocumentTitle(state)

  function applyConfig(config: AppConfig): void {
    appConfig = config
    nodeId = config.nodeId
  }

  async function openChat(chatId: string): Promise<void> {
    await userSession.openChat(chatId)
  }

  async function handleAppliedEvent(
    event: AppliedChatEvent,
    options: { rebroadcast: boolean }
  ): Promise<void> {
    await eventPipeline.handleAppliedEvent(event, options)
  }

  async function changeUser(userId: string): Promise<void> {
    await userSession.changeUser(userId)
  }

  async function pauseOnlineTransport(): Promise<void> {
    localTransportPaused.value = true
    transport.socket.setLocalTransportPaused(true)
    await transport.outbox.refreshPendingCount()
  }

  async function resumeOnlineTransport(): Promise<void> {
    localTransportPaused.value = false
    transport.socket.setLocalTransportPaused(false)
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
    initialisation.initialise().catch((error: unknown) => {
      state.lastError.value = errorMessage(error, 'Failed to initialise chat')
      state.connectionLabel.value = 'Offline, saving locally'
    })
  })

  onBeforeUnmount(() => {
    transport.close()
    browserActions.close()
    push.close()
    localEventBus.close()
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
    retryPending: transport.outbox.retryPending,
    exportDump: recoveryActions.exportDump,
    importDump: recoveryActions.importDump,
    pauseOnlineTransport,
    resumeOnlineTransport,
    requestNotifications,
    showNotificationPreview
  }
}

export type DurableChatApp = ReturnType<typeof useDurableChatApp>
