import type { ChatEvent, EventId, UserId } from '../../../../shared/types'
import { shortDeviceId } from '../../utils/deviceLabels'
import {
  encodePeerAck,
  encodePeerBatch,
  encodePeerEvent,
  encodePeerMissingRequest,
  encodePeerSummary,
  parsePeerMessage
} from './peerMessages'
import type { PeerConnectionState, PeerDataMessage, PeerMeshInput } from './peerTypes'
import type { SeenEventCache } from './seenEventCache'

interface PeerEventExchangeInput {
  meshInput: PeerMeshInput
  peers: Map<UserId, PeerConnectionState>
  seenEvents: SeenEventCache
}

export function createPeerEventExchange(input: PeerEventExchangeInput) {
  const { meshInput, peers, seenEvents } = input

  function bindChannel(peer: PeerConnectionState, channel: RTCDataChannel): void {
    peer.channel = channel
    let handledOpen = false

    const handleOpen = () => {
      if (handledOpen) return
      handledOpen = true
      meshInput.onStatus?.(`Peer fallback: connected to ${peer.userId}`)
      meshInput.onMissingSync?.('checking')
      sendPeerSummary(peer).catch(() => undefined)
    }

    channel.onopen = handleOpen
    if (channel.readyState === 'open') queueMicrotask(handleOpen)

    channel.onmessage = (message) => {
      const data = parsePeerMessage(message.data)
      if (!data) return

      if ('deviceId' in data) peer.deviceId = data.deviceId
      handlePeerMessage(peer, data)
    }
  }

  function publishEvent(event: ChatEvent, targetUserIds: UserId[]): void {
    if (targetUserIds.length === 0) {
      meshInput.onStatus?.('Peer fallback: no open peer channel')
      return
    }
    if (seenEvents.has(event.eventId)) return

    const allowedPeers = new Set(targetUserIds)
    const sentCount = sendEventToPeers(event, (peer) => allowedPeers.has(peer.userId))
    if (sentCount > 0) seenEvents.remember(event.eventId)

    meshInput.onStatus?.(
      sentCount > 0
        ? `Peer fallback: sent to ${sentCount} peer${sentCount === 1 ? '' : 's'}`
        : 'Peer fallback: no open peer channel'
    )
  }

  function handlePeerMessage(peer: PeerConnectionState, data: PeerDataMessage): void {
    if (data.type === 'event:new' && data.event) {
      processPeerEvent(peer, data.event).catch(() => undefined)
    }
    if (data.type === 'event:batch' && data.events) {
      processPeerBatch(peer, data.events).catch(() => undefined)
    }
    if (data.type === 'event:summary' && data.eventIds) {
      reconcilePeerSummary(peer, data.eventIds).catch(() => undefined)
    }
    if (data.type === 'event:request-missing' && data.eventIds) {
      sendMissingEvents(peer, data.eventIds).catch(() => undefined)
    }
    if (data.type === 'event:ack' && data.eventId && data.deviceId) {
      meshInput.onStatus?.(`Peer ACK received from ${shortDeviceId(data.deviceId)}`)
      meshInput.onPeerAck?.(data.eventId, data.deviceId)
    }
  }

  async function processPeerBatch(peer: PeerConnectionState, events: ChatEvent[]): Promise<void> {
    for (const event of events) await processPeerEvent(peer, event)
  }

  async function processPeerEvent(peer: PeerConnectionState, event: ChatEvent): Promise<void> {
    if (seenEvents.has(event.eventId)) {
      sendPeerAck(peer, event.eventId)
      return
    }

    seenEvents.remember(event.eventId)
    const accepted = await meshInput.onEvent(event, peer.deviceId ?? peer.userId)
    if (accepted) {
      meshInput.onPeerEvent?.(event)
      meshInput.onStatus?.(`Last peer event: ${event.type}`)
      sendPeerAck(peer, event.eventId)
      forwardAcceptedPeerEvent(peer, event)
    }
  }

  function forwardAcceptedPeerEvent(sourcePeer: PeerConnectionState, event: ChatEvent): void {
    const allowedPeers = new Set(meshInput.getTargetUserIds?.(event) ?? [])
    sendEventToPeers(event, (peer) => peer.userId !== sourcePeer.userId && allowedPeers.has(peer.userId))
  }

  function sendEventToPeers(
    event: ChatEvent,
    canSend: (peer: PeerConnectionState) => boolean
  ): number {
    const payload = encodePeerEvent(event)
    let sentCount = 0

    for (const peer of peers.values()) {
      if (!canSend(peer)) continue
      if (peer.channel?.readyState === 'open') {
        peer.channel.send(payload)
        sentCount += 1
      }
    }

    return sentCount
  }

  async function sendPeerSummary(peer: PeerConnectionState): Promise<void> {
    if (peer.channel?.readyState !== 'open') return
    const events = await meshInput.getEventsForPeer(peer.userId)
    peer.channel.send(encodePeerSummary(events.map((event) => event.eventId), meshInput.deviceId))
  }

  async function reconcilePeerSummary(peer: PeerConnectionState, peerEventIds: EventId[]): Promise<void> {
    if (peer.channel?.readyState !== 'open') return

    const localEvents = await meshInput.getEventsForPeer(peer.userId)
    const localEventIds = new Set(localEvents.map((event) => event.eventId))
    const peerEventIdSet = new Set(peerEventIds)
    const eventsMissingOnPeer = localEvents.filter((event) => !peerEventIdSet.has(event.eventId))
    const eventsMissingLocally = peerEventIds.filter((eventId) => !localEventIds.has(eventId))

    if (eventsMissingOnPeer.length > 0) {
      peer.channel.send(encodePeerBatch(eventsMissingOnPeer))
    }
    if (eventsMissingLocally.length > 0) {
      peer.channel.send(encodePeerMissingRequest(eventsMissingLocally, meshInput.deviceId))
    }
    meshInput.onMissingSync?.(eventsMissingLocally.length > 0 ? 'requesting missing events' : 'complete')
  }

  async function sendMissingEvents(peer: PeerConnectionState, eventIds: EventId[]): Promise<void> {
    if (peer.channel?.readyState !== 'open') return
    const events = await meshInput.getEventsByIdsForPeer(eventIds, peer.userId)
    if (events.length > 0) {
      peer.channel.send(encodePeerBatch(events))
    }
    meshInput.onMissingSync?.('complete')
  }

  function sendPeerAck(peer: PeerConnectionState, eventId: EventId): void {
    if (peer.channel?.readyState !== 'open') return
    peer.channel.send(encodePeerAck(eventId, meshInput.deviceId))
  }

  return {
    bindChannel,
    publishEvent
  }
}
