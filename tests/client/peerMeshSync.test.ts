import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPeerMesh } from '../../client/src/services/realtime/peerMesh'
import type { ChatEvent, UserId } from '../../shared/types'
import {
  decodePeerMessages,
  FakeDataChannel,
  installFakePeerConnection,
  restorePeerConnection
} from '../helpers/fakePeerConnection'

function messageEvent(eventId: string, chatId = 'chat-anna-denis'): ChatEvent {
  return {
    eventId,
    originNodeId: 'browser-test',
    originDeviceId: 'device-anna',
    actorUserId: 'u-anna',
    chatId,
    type: 'message.created',
    payload: {
      messageId: `msg-${eventId}`,
      clientMessageId: `msg-${eventId}`,
      chatId,
      text: 'Peer mesh sync'
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    logicalClock: 1,
    syncStatus: 'local'
  }
}

describe('peer mesh sync protocol', () => {
  const originalPeerConnection = globalThis.RTCPeerConnection

  afterEach(() => {
    restorePeerConnection(originalPeerConnection)
  })

  it('exchanges summaries, backfills missing events and records ACKs', async () => {
    const channels = new Map<UserId, FakeDataChannel>()
    installFakePeerConnection(['u-denis'], channels)

    const localEvent = messageEvent('local:event-a')
    const remoteEvent = messageEvent('remote:event-b')
    const onEvent = vi.fn(async () => true)
    const onPeerAck = vi.fn()
    const onStatus = vi.fn()
    const mesh = createPeerMesh({
      currentUserId: () => 'u-anna',
      deviceId: 'device-anna',
      sendSignal: vi.fn(),
      getEventsForPeer: vi.fn(async () => [localEvent]),
      getEventsByIdsForPeer: vi.fn(async (eventIds) => eventIds.includes(localEvent.eventId) ? [localEvent] : []),
      onEvent,
      onPeerAck,
      onStatus
    })

    mesh.updatePeers(['u-denis'])
    const channel = channels.get('u-denis')
    if (!channel) throw new Error('Expected fake peer channel')

    await vi.waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith('Peer fallback: connected to u-denis')
      expect(decodePeerMessages(channel).some((message) =>
        message.type === 'event:summary' &&
        Array.isArray(message.eventIds) &&
        message.eventIds.includes(localEvent.eventId)
      )).toBe(true)
    })

    channel.onmessage?.({
      data: JSON.stringify({
        type: 'event:summary',
        eventIds: [remoteEvent.eventId],
        deviceId: 'device-denis'
      })
    })

    await vi.waitFor(() => {
      const messages = decodePeerMessages(channel)
      expect(messages.some((message) =>
        message.type === 'event:batch' &&
        Array.isArray(message.events) &&
        message.events.some((event) => (event as ChatEvent).eventId === localEvent.eventId)
      )).toBe(true)
      expect(messages.some((message) =>
        message.type === 'event:request-missing' &&
        Array.isArray(message.eventIds) &&
        message.eventIds.includes(remoteEvent.eventId)
      )).toBe(true)
    })

    channel.onmessage?.({
      data: JSON.stringify({
        type: 'event:new',
        event: remoteEvent
      })
    })

    await vi.waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith(remoteEvent, 'device-denis')
      expect(decodePeerMessages(channel).some((message) =>
        message.type === 'event:ack' &&
        message.eventId === remoteEvent.eventId &&
        message.deviceId === 'device-anna'
      )).toBe(true)
    })

    channel.onmessage?.({
      data: JSON.stringify({
        type: 'event:ack',
        eventId: localEvent.eventId,
        deviceId: 'device-denis'
      })
    })

    expect(onPeerAck).toHaveBeenCalledWith(localEvent.eventId, 'device-denis')
    mesh.close()
  })

  it('evicts old seen event ids so duplicate tracking stays bounded', () => {
    const channels = new Map<UserId, FakeDataChannel>()
    installFakePeerConnection(['u-denis'], channels)

    const mesh = createPeerMesh({
      currentUserId: () => 'u-anna',
      deviceId: 'device-anna',
      sendSignal: vi.fn(),
      getEventsForPeer: vi.fn(async () => []),
      getEventsByIdsForPeer: vi.fn(async () => []),
      onEvent: vi.fn(async () => true)
    })

    mesh.updatePeers(['u-denis'])
    const channel = channels.get('u-denis')
    if (!channel) throw new Error('Expected fake peer channel')

    const firstEvent = messageEvent('event-0')
    mesh.publishEvent(firstEvent, ['u-denis'])
    mesh.publishEvent(firstEvent, ['u-denis'])

    expect(channel.sent).toHaveLength(1)

    for (let index = 1; index <= 2_000; index += 1) {
      mesh.publishEvent(messageEvent(`event-${index}`), ['u-denis'])
    }

    mesh.publishEvent(firstEvent, ['u-denis'])

    expect(channel.sent).toHaveLength(2_002)
    mesh.close()
  })
})
