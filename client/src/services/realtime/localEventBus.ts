import type { ChatEvent } from '../../../../shared/types'

const CHANNEL_NAME = 'resilient-field-chat-events'

export interface LocalEventBus {
  publish: (event: ChatEvent) => void
  close: () => void
}

export function createLocalEventBus(onEvent: (event: ChatEvent) => void): LocalEventBus {
  if (typeof BroadcastChannel === 'undefined') {
    return {
      publish: () => undefined,
      close: () => undefined
    }
  }

  const channel = new BroadcastChannel(CHANNEL_NAME)
  const messageHandler = (message: MessageEvent<unknown>) => {
    if (isChatEvent(message.data)) onEvent(message.data)
  }

  channel.addEventListener('message', messageHandler)

  return {
    publish: (event) => {
      channel.postMessage(event)
    },
    close: () => {
      channel.removeEventListener('message', messageHandler)
      channel.close()
    }
  }
}

function isChatEvent(value: unknown): value is ChatEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<ChatEvent>
  return typeof event.eventId === 'string' && typeof event.chatId === 'string' && typeof event.type === 'string'
}
