import type { ChatId } from '../../../../shared/types'
import type { ChatState } from '../composables/useChatState'
import { errorMessage } from '../errorMessage'

interface OpenChatServiceWorkerMessage {
  type: 'OPEN_CHAT'
  chatId: ChatId
  userId?: string
}

export interface ChatBrowserActions {
  bindServiceWorkerMessages: () => void
  close: () => void
  openChatFromUrlIfPossible: () => void
  updateChatQueryParam: (chatId: ChatId) => void
  syncUserIdentity: (userId: string) => void
}

interface ChatBrowserActionsInput {
  state: ChatState
  openChat: (chatId: ChatId) => Promise<void>
  ensureUser?: (userId: string) => Promise<void>
}

export function createChatBrowserActions(input: ChatBrowserActionsInput): ChatBrowserActions {
  const { state } = input
  let serviceWorkerMessageHandler: ((event: MessageEvent<unknown>) => void) | null = null

  function bindServiceWorkerMessages(): void {
    if (!('serviceWorker' in navigator)) return
    if (serviceWorkerMessageHandler) return

    serviceWorkerMessageHandler = (event: MessageEvent<unknown>) => {
      if (!isOpenChatMessage(event.data)) return
      handleOpenChatMessage(event.data).catch((error: unknown) => {
        state.lastError.value = errorMessage(error, 'Failed to open chat from notification')
      })
    }

    navigator.serviceWorker.addEventListener('message', serviceWorkerMessageHandler)
  }

  function close(): void {
    if (!serviceWorkerMessageHandler || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.removeEventListener('message', serviceWorkerMessageHandler)
    serviceWorkerMessageHandler = null
  }

  async function handleOpenChatMessage(message: OpenChatServiceWorkerMessage): Promise<void> {
    if (message.userId && message.userId !== state.currentUserId.value) {
      await input.ensureUser?.(message.userId)
    }
    await input.openChat(message.chatId)
  }

  function openChatFromUrlIfPossible(): void {
    const chatId = new URLSearchParams(window.location.search).get('chat')
    if (chatId && state.chats.value.some((chat) => chat.id === chatId)) {
      state.activeChatId.value = chatId
    }
  }

  function updateChatQueryParam(chatId: ChatId): void {
    const url = new URL(window.location.href)
    url.searchParams.set('chat', chatId)
    url.searchParams.set('user', state.currentUserId.value)
    history.replaceState({}, '', url)
    announceClientState(state.currentUserId.value)
  }

  function syncUserIdentity(userId: string): void {
    const url = new URL(window.location.href)
    url.searchParams.set('user', userId)
    history.replaceState({}, '', url)
    announceClientState(userId)
  }

  function announceClientState(userId: string): void {
    if (!('serviceWorker' in navigator)) return

    const payload = {
      type: 'CLIENT_STATE',
      userId,
      url: window.location.href
    }

    navigator.serviceWorker.controller?.postMessage(payload)
    navigator.serviceWorker.ready
      .then((registration) => registration.active?.postMessage(payload))
      .catch(() => undefined)
  }

  return {
    bindServiceWorkerMessages,
    close,
    openChatFromUrlIfPossible,
    updateChatQueryParam,
    syncUserIdentity
  }
}

function isOpenChatMessage(data: unknown): data is OpenChatServiceWorkerMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    'chatId' in data &&
    data.type === 'OPEN_CHAT' &&
    typeof data.chatId === 'string' &&
    (!('userId' in data) || typeof data.userId === 'string')
  )
}
