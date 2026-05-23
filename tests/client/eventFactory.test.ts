import { beforeEach, describe, expect, it } from 'vitest'
import { clientConfig } from '../../client/src/config/clientConfig'
import { createChatEvent } from '../../client/src/services/eventFactory'

describe('chat event factory', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('advances the logical clock from session storage for each event', () => {
    const first = createEvent()
    sessionStorage.setItem(clientConfig.storageKeys.logicalClock, '10')
    const second = createEvent()

    expect(first.logicalClock).toBe(1)
    expect(second.logicalClock).toBe(11)
  })
})

function createEvent() {
  return createChatEvent({
    nodeId: 'node-a',
    deviceId: 'device-a',
    actorUserId: 'u-denis',
    chatId: 'chat-a',
    type: 'message.created',
    payload: {
      chatId: 'chat-a',
      messageId: crypto.randomUUID(),
      clientMessageId: crypto.randomUUID(),
      text: 'hello'
    }
  })
}
