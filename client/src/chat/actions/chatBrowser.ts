import type { ChatId } from '../../../../shared/types'
import type { ChatState } from '../composables/useChatState'
import { errorMessage } from '../errorMessage'

interface OpenChatServiceWorkerMessage {
  type: 'OPEN_CHAT'
  chatId: ChatId
}

export interface ChatBrowserActions {
  bindServiceWorkerMessages: () => void
  close: () => void
  openChatFromUrlIfPossible: () => void
  updateChatQueryParam: (chatId: ChatId) => void
}

interface ChatBrowserActionsInput {
  state: ChatState
  openChat: (chatId: ChatId) => Promise<void>
}

export function createChatBrowserActions(input: ChatBrowserActionsInput): ChatBrowserActions {
  const { state } = input
  let serviceWorkerMessageHandler: ((event: MessageEvent<unknown>) => void) | null = null

  function bindServiceWorkerMessages(): void {
    if (!('serviceWorker' in navigator)) return
    if (serviceWorkerMessageHandler) return

    serviceWorkerMessageHandler = (event: MessageEvent<unknown>) => {
      if (!isOpenChatMessage(event.data)) return
      input.openChat(event.data.chatId).catch((error: unknown) => {
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

  function openChatFromUrlIfPossible(): void {
    const chatId = new URLSearchParams(window.location.search).get('chat')
    if (chatId && state.chats.value.some((chat) => chat.id === chatId)) {
      state.activeChatId.value = chatId
    }
  }

  function updateChatQueryParam(chatId: ChatId): void {
    const url = new URL(window.location.href)
    url.searchParams.set('chat', chatId)
    history.replaceState({}, '', url)
  }

  return {
    bindServiceWorkerMessages,
    close,
    openChatFromUrlIfPossible,
    updateChatQueryParam
  }
}

function isOpenChatMessage(data: unknown): data is OpenChatServiceWorkerMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    'chatId' in data &&
    data.type === 'OPEN_CHAT' &&
    typeof data.chatId === 'string'
  )
}
