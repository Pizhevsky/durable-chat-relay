import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalEventBus } from '../../client/src/services/realtime/localEventBus'
import { messageCreatedEvent } from '../helpers/chatEvents'

const channels = new Map<string, Set<FakeBroadcastChannel>>()

class FakeBroadcastChannel {
  listeners = new Set<(message: MessageEvent<unknown>) => void>()

  constructor(readonly name: string) {
    const channelSet = channels.get(name) ?? new Set<FakeBroadcastChannel>()
    channelSet.add(this)
    channels.set(name, channelSet)
  }

  addEventListener(_type: 'message', listener: (message: MessageEvent<unknown>) => void): void {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'message', listener: (message: MessageEvent<unknown>) => void): void {
    this.listeners.delete(listener)
  }

  postMessage(data: unknown): void {
    for (const channel of channels.get(this.name) ?? []) {
      if (channel === this) continue
      for (const listener of channel.listeners) listener({ data } as MessageEvent<unknown>)
    }
  }

  close(): void {
    channels.get(this.name)?.delete(this)
  }
}

function messageEvent() {
  return messageCreatedEvent({
    eventId: 'event-1',
    originNodeId: 'browser-test',
    originDeviceId: 'device-denis',
    actorUserId: 'u-denis',
    chatId: 'chat-group',
    payload: {
      messageId: 'msg-1',
      clientMessageId: 'msg-1',
      chatId: 'chat-group',
      text: 'Same user only'
    }
  })
}

describe('local event bus', () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel

  afterEach(() => {
    vi.restoreAllMocks()
    channels.clear()
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: originalBroadcastChannel
    })
  })

  it('rebroadcasts events only to tabs for the same demo user', () => {
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: FakeBroadcastChannel
    })

    const denisReceived = vi.fn()
    const ivanReceived = vi.fn()
    const denisSender = createLocalEventBus({
      getUserId: () => 'u-denis',
      onEvent: vi.fn()
    })
    const denisReceiver = createLocalEventBus({
      getUserId: () => 'u-denis',
      onEvent: denisReceived
    })
    const ivanReceiver = createLocalEventBus({
      getUserId: () => 'u-ivan',
      onEvent: ivanReceived
    })

    denisSender.publish(messageEvent())

    expect(denisReceived).toHaveBeenCalledOnce()
    expect(ivanReceived).not.toHaveBeenCalled()

    denisSender.close()
    denisReceiver.close()
    ivanReceiver.close()
  })
})
