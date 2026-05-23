import type { ChatEvent, UserId } from '../../../../shared/types'
import { clientConfig } from '../../config/clientConfig'

interface LocalEventBusMessage {
  userId: UserId
  event: ChatEvent
}

export interface LocalEventBus {
  publish: (event: ChatEvent) => void
  close: () => void
}

export function createLocalEventBus(input: {
  getUserId: () => UserId
  onEvent: (event: ChatEvent) => void
}): LocalEventBus {
  if (typeof BroadcastChannel === 'undefined') {
    return {
      publish: () => undefined,
      close: () => undefined
    }
  }

  const channel = new BroadcastChannel(clientConfig.localEventChannelName)
  const messageHandler = (message: MessageEvent<unknown>) => {
    if (!isLocalEventBusMessage(message.data)) return
    if (message.data.userId !== input.getUserId()) return
    input.onEvent(message.data.event)
  }

  channel.addEventListener('message', messageHandler)

  return {
    publish: (event) => {
      channel.postMessage({
        userId: input.getUserId(),
        event
      })
    },
    close: () => {
      channel.removeEventListener('message', messageHandler)
      channel.close()
    }
  }
}

function isLocalEventBusMessage(value: unknown): value is LocalEventBusMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<LocalEventBusMessage>
  if (typeof message.userId !== 'string') return false
  return isChatEvent(message.event)
}

function isChatEvent(value: unknown): value is ChatEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<ChatEvent>
  return typeof event.eventId === 'string' && typeof event.chatId === 'string' && typeof event.type === 'string'
}
