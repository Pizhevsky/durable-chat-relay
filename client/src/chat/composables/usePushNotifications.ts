import { ref } from 'vue'
import type { Message } from '../../../../shared/types'

const serviceWorkerUrl = new URL('../../../worker.js', import.meta.url)

interface ChatNotificationPayload {
  type: 'CHAT_NOTIFICATION'
  title: string
  body: string
  chatId: string
  messageId?: string
}

interface InAppNotification {
  title: string
  body: string
  chatId: string
}

export function usePushNotifications() {
  const permission = ref<NotificationPermission | 'unsupported'>('unsupported')
  const lastNotificationStatus = ref<string | null>(null)
  const inAppNotification = ref<InAppNotification | null>(null)
  let notificationStatusTimer: ReturnType<typeof setTimeout> | null = null
  let inAppNotificationTimer: ReturnType<typeof setTimeout> | null = null
  let registration: ServiceWorkerRegistration | null = null

  async function initialise(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      permission.value = 'unsupported'
      setNotificationStatus('Notifications are not supported in this browser.')
      return
    }

    registration = await navigator.serviceWorker.register(serviceWorkerUrl)
    permission.value = Notification.permission
  }

  async function requestPermission(): Promise<void> {
    if (!('Notification' in window)) {
      permission.value = 'unsupported'
      setNotificationStatus('Notifications are not supported in this browser.')
      return
    }

    permission.value = await Notification.requestPermission()
    setNotificationStatus(
      permission.value === 'granted'
        ? 'Notifications are allowed.'
        : 'Notifications were not allowed by the browser.'
    )
  }

  async function showDemoNotification(): Promise<void> {
    await ensurePermission()
    await showNotificationPayload({
      type: 'CHAT_NOTIFICATION',
      title: 'Resilient chat notification test',
      body: 'This is how a hidden/offline field-office message appears.',
      chatId: 'demo-notification'
    })
    setNotificationStatus('Test notification was sent to the browser.')
  }

  function notifyFromForeground(message: Message): void {
    if (document.visibilityState === 'visible') {
      showInAppNotification({
        title: `Message from ${message.senderName}`,
        body: message.text,
        chatId: message.chatId
      })
      return
    }

    if (permission.value !== 'granted') return

    showNotificationPayload({
      type: 'CHAT_NOTIFICATION',
      title: `Message from ${message.senderName}`,
      body: message.text,
      chatId: message.chatId,
      messageId: message.id
    }).catch(() => undefined)
  }

  async function ensurePermission(): Promise<void> {
    if (permission.value === 'granted') return
    await requestPermission()
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      setNotificationStatus('Notification permission was not granted.')
      throw new Error('Notification permission was not granted')
    }
  }

  function setNotificationStatus(message: string): void {
    lastNotificationStatus.value = message
    if (notificationStatusTimer) clearTimeout(notificationStatusTimer)
    notificationStatusTimer = setTimeout(() => {
      lastNotificationStatus.value = null
      notificationStatusTimer = null
    }, 5000)
  }

  function showInAppNotification(notification: InAppNotification): void {
    inAppNotification.value = notification
    if (inAppNotificationTimer) clearTimeout(inAppNotificationTimer)
    inAppNotificationTimer = setTimeout(() => {
      inAppNotification.value = null
      inAppNotificationTimer = null
    }, 5000)
  }

  function close(): void {
    if (notificationStatusTimer) clearTimeout(notificationStatusTimer)
    if (inAppNotificationTimer) clearTimeout(inAppNotificationTimer)
    notificationStatusTimer = null
    inAppNotificationTimer = null
  }

  async function showNotificationPayload(payload: ChatNotificationPayload): Promise<void> {
    if (!registration) registration = await navigator.serviceWorker.register(serviceWorkerUrl)
    const controller =
      navigator.serviceWorker.controller ??
      registration.active ??
      registration.waiting ??
      registration.installing

    if (controller) {
      controller.postMessage(payload)
      return
    }

    await registration.showNotification(payload.title, {
      body: payload.body,
      tag: String(
        payload.messageId
          ? `message-${payload.messageId}`
          : payload.chatId ? `chat-${payload.chatId}` : 'field-chat'
      ),
      data: {
        chatId: payload.chatId,
        messageId: payload.messageId
      }
    })
  }

  return {
    permission,
    lastNotificationStatus,
    inAppNotification,
    initialise,
    requestPermission,
    showDemoNotification,
    notifyFromForeground,
    getRegistration: () => registration,
    close
  }
}
