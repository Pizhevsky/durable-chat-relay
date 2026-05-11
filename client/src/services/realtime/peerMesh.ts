import type { ChatEvent, EventId, PeerSignalMessage, UserId } from '../../../../shared/types'
import { closePeerConnection, createPeerConnectionState } from './peerConnections'
import {
  encodePeerAck,
  encodePeerBatch,
  encodePeerEvent,
  encodePeerMissingRequest,
  encodePeerSummary,
  parsePeerMessage
} from './peerMessages'
import { iceCandidate, sessionDescription, supportsWebRtc } from './peerSignals'
import type { PeerConnectionState, PeerDataMessage, PeerMesh, PeerMeshInput } from './peerTypes'
import { createSeenEventCache } from './seenEventCache'
import { clientConfig } from '../../config/clientConfig'

export function createPeerMesh(input: PeerMeshInput): PeerMesh {
  const peers = new Map<UserId, PeerConnectionState>()
  const seenEvents = createSeenEventCache(clientConfig.peer.maxSeenEvents)

  function updatePeers(userIds: UserId[]): void {
    if (!supportsWebRtc()) return

    const currentUserId = input.currentUserId()
    const nextPeerIds = new Set(userIds.filter((userId) => userId !== currentUserId))

    for (const userId of nextPeerIds) {
      const existing = peers.get(userId)
      if (existing && isStalePeer(existing)) {
        closePeerConnection(existing)
        peers.delete(userId)
      }
      ensurePeer(userId)
    }
    for (const [userId, peer] of peers) {
      if (!nextPeerIds.has(userId)) {
        closePeerConnection(peer)
        peers.delete(userId)
      }
    }
  }

  function isStalePeer(peer: PeerConnectionState): boolean {
    if (peer.connection.connectionState === 'failed') return true
    if (peer.connection.connectionState === 'closed') return true
    if (peer.connection.connectionState === 'disconnected') return true
    if (!peer.channel && peer.connection.signalingState !== 'stable') return true
    if (peer.channel?.readyState === 'closed') return true

    return false
  }

  async function handleSignal(message: PeerSignalMessage): Promise<void> {
    if (!supportsWebRtc() || message.fromUserId === input.currentUserId()) return

    const peer = ensurePeer(message.fromUserId)
    peer.deviceId = message.fromDeviceId
    const signal = message.signal

    if (signal.type === 'candidate') {
      if (peer.connection.remoteDescription) {
        await peer.connection.addIceCandidate(signal.candidate)
      } else {
        peer.pendingCandidates.push(signal.candidate)
      }
      return
    }

    const offerCollision = signal.type === 'offer' && (peer.makingOffer || peer.connection.signalingState !== 'stable')
    if (offerCollision && !peer.polite) return

    await peer.connection.setRemoteDescription(signal.sdp)
    await flushCandidates(peer)

    if (signal.type === 'offer') {
      await peer.connection.setLocalDescription()
      input.sendSignal(message.fromUserId, {
        type: 'answer',
        sdp: sessionDescription(peer.connection)
      })
    }
  }

  function publishEvent(event: ChatEvent, targetUserIds: UserId[]): void {
    if (targetUserIds.length === 0) {
      input.onStatus?.('Peer fallback: no open peer channel')
      return
    }
    if (seenEvents.has(event.eventId)) return

    const allowedPeers = new Set(targetUserIds)
    const sentCount = sendEventToPeers(event, (peer) => allowedPeers.has(peer.userId))
    if (sentCount > 0) seenEvents.remember(event.eventId)

    input.onStatus?.(
      sentCount > 0
        ? `Peer fallback: sent to ${sentCount} peer${sentCount === 1 ? '' : 's'}`
        : 'Peer fallback: no open peer channel'
    )
  }

  function close(): void {
    for (const peer of peers.values()) closePeerConnection(peer)
    peers.clear()
    seenEvents.clear()
  }

  function ensurePeer(userId: UserId): PeerConnectionState {
    const existing = peers.get(userId)
    if (existing) return existing

    const peer = createPeerConnectionState({
      userId,
      currentUserId: input.currentUserId(),
      onDataChannel: bindChannel,
      onIceCandidate: sendCandidate,
      onNegotiationNeeded: (nextPeer) => {
        void negotiate(nextPeer)
      },
      onConnectionStateChange: updateConnectionStatus
    })

    peers.set(userId, peer)
    return peer
  }

  function sendCandidate(peer: PeerConnectionState, candidate: RTCIceCandidate): void {
    input.sendSignal(peer.userId, {
      type: 'candidate',
      candidate: iceCandidate(candidate)
    })
  }

  function updateConnectionStatus(peer: PeerConnectionState): void {
    const state = peer.connection.connectionState
    if (state === 'connected') input.onStatus?.(`Peer fallback: connected to ${peer.userId}`)
    if (state === 'failed' || state === 'closed') input.onStatus?.('Peer fallback: waiting')
  }

  async function negotiate(peer: PeerConnectionState): Promise<void> {
    try {
      peer.makingOffer = true
      await peer.connection.setLocalDescription()
      input.sendSignal(peer.userId, {
        type: 'offer',
        sdp: sessionDescription(peer.connection)
      })
    } finally {
      peer.makingOffer = false
    }
  }

  async function flushCandidates(peer: PeerConnectionState): Promise<void> {
    for (const candidate of peer.pendingCandidates) {
      await peer.connection.addIceCandidate(candidate)
    }
    peer.pendingCandidates = []
  }

  function bindChannel(peer: PeerConnectionState, channel: RTCDataChannel): void {
    peer.channel = channel
    let handledOpen = false

    const handleOpen = () => {
      if (handledOpen) return
      handledOpen = true
      input.onStatus?.(`Peer fallback: connected to ${peer.userId}`)
      input.onMissingSync?.('checking')
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
      input.onStatus?.(`Peer ACK received: ${data.eventId}`)
      input.onPeerAck?.(data.eventId, data.deviceId)
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
    const accepted = await input.onEvent(event, peer.deviceId ?? peer.userId)
    if (accepted) {
      input.onPeerEvent?.(event)
      input.onStatus?.(`Last peer event: ${event.type}`)
      sendPeerAck(peer, event.eventId)
      const allowedPeers = new Set(input.getTargetUserIds?.(event) ?? [])
      sendEventToPeers(event, (nextPeer) => nextPeer.userId !== peer.userId && allowedPeers.has(nextPeer.userId))
    }
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
    const events = await input.getEventsForPeer(peer.userId)
    peer.channel.send(encodePeerSummary(events.map((event) => event.eventId), input.deviceId))
  }

  async function reconcilePeerSummary(peer: PeerConnectionState, peerEventIds: EventId[]): Promise<void> {
    if (peer.channel?.readyState !== 'open') return

    const localEvents = await input.getEventsForPeer(peer.userId)
    const localEventIds = new Set(localEvents.map((event) => event.eventId))
    const peerEventIdSet = new Set(peerEventIds)
    const eventsMissingOnPeer = localEvents.filter((event) => !peerEventIdSet.has(event.eventId))
    const eventsMissingLocally = peerEventIds.filter((eventId) => !localEventIds.has(eventId))

    if (eventsMissingOnPeer.length > 0) {
      peer.channel.send(encodePeerBatch(eventsMissingOnPeer))
    }
    if (eventsMissingLocally.length > 0) {
      peer.channel.send(encodePeerMissingRequest(eventsMissingLocally, input.deviceId))
    }
    input.onMissingSync?.(eventsMissingLocally.length > 0 ? 'requesting missing events' : 'complete')
  }

  async function sendMissingEvents(peer: PeerConnectionState, eventIds: EventId[]): Promise<void> {
    if (peer.channel?.readyState !== 'open') return
    const events = await input.getEventsByIdsForPeer(eventIds, peer.userId)
    if (events.length > 0) {
      peer.channel.send(encodePeerBatch(events))
    }
    input.onMissingSync?.('complete')
  }

  function sendPeerAck(peer: PeerConnectionState, eventId: EventId): void {
    if (peer.channel?.readyState !== 'open') return
    peer.channel.send(encodePeerAck(eventId, input.deviceId))
  }

  return {
    updatePeers,
    handleSignal,
    publishEvent,
    close
  }
}
