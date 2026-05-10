import type { ChatEvent, EventId, PeerSignalMessage, UserId } from '../../../../shared/types'
import { createPeerConnectionState } from './peerConnections'
import {
  encodePeerAck,
  encodePeerBatch,
  encodePeerEvent,
  encodePeerMissingRequest,
  encodePeerSummary,
  parsePeerMessage
} from './peerMessages'
import { iceCandidate, sessionDescription, supportsWebRtc } from './peerSignals'
import type { PeerConnectionState, PeerMesh, PeerMeshInput } from './peerTypes'

const MAX_SEEN_EVENTS = 2_000

export function createPeerMesh(input: PeerMeshInput): PeerMesh {
  const peers = new Map<UserId, PeerConnectionState>()
  const seenEvents = new Set<string>()
  const seenEventOrder: string[] = []

  function updatePeers(userIds: UserId[]): void {
    if (!supportsWebRtc()) return

    const currentUserId = input.currentUserId()
    const nextPeerIds = new Set(userIds.filter((userId) => userId !== currentUserId))

    for (const userId of nextPeerIds) ensurePeer(userId)
    for (const [userId, peer] of peers) {
      if (!nextPeerIds.has(userId)) {
        closePeer(peer)
        peers.delete(userId)
      }
    }
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
    const targetUsers = new Set(targetUserIds)
    if (targetUsers.size === 0) return
    if (seenEvents.has(event.eventId)) return
    rememberEvent(event.eventId)

    const payload = encodePeerEvent(event)

    for (const peer of peers.values()) {
      if (!targetUsers.has(peer.userId)) continue
      if (peer.channel?.readyState === 'open') peer.channel.send(payload)
    }
  }

  function close(): void {
    for (const peer of peers.values()) closePeer(peer)
    peers.clear()
    seenEvents.clear()
    seenEventOrder.length = 0
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

      if (data.deviceId) peer.deviceId = data.deviceId

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
  }

  async function processPeerBatch(peer: PeerConnectionState, events: ChatEvent[]): Promise<void> {
    for (const event of events) await processPeerEvent(peer, event)
  }

  async function processPeerEvent(peer: PeerConnectionState, event: ChatEvent): Promise<void> {
    if (seenEvents.has(event.eventId)) {
      sendPeerAck(peer, event.eventId)
      return
    }

    rememberEvent(event.eventId)
    const accepted = await input.onEvent(event, peer.deviceId ?? peer.userId)
    if (accepted) {
      input.onPeerEvent?.(event)
      input.onStatus?.(`Last peer event: ${event.type}`)
      sendPeerAck(peer, event.eventId)
    }
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

  function rememberEvent(eventId: EventId): void {
    if (seenEvents.has(eventId)) return

    seenEvents.add(eventId)
    seenEventOrder.push(eventId)

    while (seenEventOrder.length > MAX_SEEN_EVENTS) {
      const oldestEventId = seenEventOrder.shift()
      if (oldestEventId) seenEvents.delete(oldestEventId)
    }
  }

  function closePeer(peer: PeerConnectionState): void {
    if (peer.channel) {
      peer.channel.onopen = null
      peer.channel.onmessage = null
      if (
        typeof peer.channel.close === 'function' &&
        (peer.channel.readyState === 'open' || peer.channel.readyState === 'connecting')
      ) {
        peer.channel.close()
      }
      peer.channel = undefined
    }

    peer.connection.ondatachannel = null
    peer.connection.onicecandidate = null
    peer.connection.onnegotiationneeded = null
    peer.connection.onconnectionstatechange = null
    peer.connection.close()
    peer.pendingCandidates = []
  }

  return {
    updatePeers,
    handleSignal,
    publishEvent,
    close
  }
}
