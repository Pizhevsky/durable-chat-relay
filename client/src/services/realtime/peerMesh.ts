import type { ChatEvent, PeerSignalMessage, UserId } from '../../../../shared/types'
import { closePeerConnection, createPeerConnectionState } from './peerConnections'
import { createPeerEventExchange } from './peerEventExchange'
import { iceCandidate, sessionDescription, supportsWebRtc } from './peerSignals'
import type { PeerConnectionState, PeerMesh, PeerMeshInput } from './peerTypes'
import { createSeenEventCache } from './seenEventCache'
import { clientConfig } from '../../config/clientConfig'

export function createPeerMesh(input: PeerMeshInput): PeerMesh {
  const peers = new Map<UserId, PeerConnectionState>()
  const seenEvents = createSeenEventCache(clientConfig.peer.maxSeenEvents)
  const eventExchange = createPeerEventExchange({
    meshInput: input,
    peers,
    seenEvents
  })

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
    eventExchange.publishEvent(event, targetUserIds)
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
      onDataChannel: eventExchange.bindChannel,
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

  return {
    updatePeers,
    handleSignal,
    publishEvent,
    close
  }
}
