import { onBeforeUnmount, onMounted } from 'vue'
import type { UserId } from '../../../../shared/types'
import { clientConfig } from '../../config/clientConfig'
import { LOCAL_ONLY_CLOSE_WARNING } from '../../utils/chatLabels'
import { errorMessage } from '../errorMessage'
import type { DurableChatApp } from './useDurableChatApp'

export function useDemoControls(app: DurableChatApp) {
  async function initialise(): Promise<void> {
    if (sessionStorage.getItem(clientConfig.storageKeys.localOnlySession) !== '1') return
    await enableLocalOnly()
  }

  async function enableLocalOnly(): Promise<void> {
    sessionStorage.setItem(clientConfig.storageKeys.localOnlySession, '1')
    await app.pauseOnlineTransport()
  }

  async function disableLocalOnly(): Promise<void> {
    sessionStorage.removeItem(clientConfig.storageKeys.localOnlySession)
    await app.resumeOnlineTransport()
  }

  async function showNotification(): Promise<void> {
    await app.showNotificationPreview()
  }

  function openUserWindow(userId: UserId): void {
    const url = new URL(window.location.href)
    url.searchParams.set('user', userId)
    url.searchParams.set(clientConfig.newDeviceQueryParam, '1')
    const activeChat = app.activeChat.value
    if (activeChat?.members.some((member) => member.userId === userId)) {
      url.searchParams.set('chat', activeChat.id)
    } else {
      url.searchParams.delete('chat')
    }
    window.open(url.toString(), `field-chat-${userId}`, clientConfig.demo.userWindowFeatures)
  }

  function warnBeforeLocalOnlyClose(event: BeforeUnloadEvent): string | undefined {
    if (!app.localTransportPaused.value) return undefined

    event.preventDefault()
    event.returnValue = LOCAL_ONLY_CLOSE_WARNING
    return LOCAL_ONLY_CLOSE_WARNING
  }

  onMounted(() => {
    initialise().catch((error: unknown) => {
      app.lastError.value = errorMessage(error, 'Failed to initialise demo controls')
    })
    window.addEventListener('beforeunload', warnBeforeLocalOnlyClose)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', warnBeforeLocalOnlyClose)
  })

  return {
    localOnly: app.localTransportPaused,
    enableLocalOnly,
    disableLocalOnly,
    showNotification,
    openUserWindow
  }
}
