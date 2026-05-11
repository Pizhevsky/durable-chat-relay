import type { UserId } from '../../../../shared/types'
import { ICE_SERVERS } from './peerSignals'
import type { PeerConnectionState } from './peerTypes'

interface CreatePeerConnectionInput {
  userId: UserId
  currentUserId: UserId
  onDataChannel: (peer: PeerConnectionState, channel: RTCDataChannel) => void
  onIceCandidate: (peer: PeerConnectionState, candidate: RTCIceCandidate) => void
  onNegotiationNeeded: (peer: PeerConnectionState) => void
  onConnectionStateChange: (peer: PeerConnectionState) => void
}

export function createPeerConnectionState(input: CreatePeerConnectionInput): PeerConnectionState {
  const peer: PeerConnectionState = {
    userId: input.userId,
    connection: new RTCPeerConnection({ iceServers: ICE_SERVERS }),
    pendingCandidates: [],
    makingOffer: false,
    polite: input.currentUserId > input.userId
  }

  peer.connection.ondatachannel = (event) => {
    input.onDataChannel(peer, event.channel)
  }

  peer.connection.onicecandidate = (event) => {
    if (event.candidate) input.onIceCandidate(peer, event.candidate)
  }

  peer.connection.onnegotiationneeded = () => {
    input.onNegotiationNeeded(peer)
  }

  peer.connection.onconnectionstatechange = () => {
    input.onConnectionStateChange(peer)
  }

  if (!peer.polite) {
    input.onDataChannel(peer, peer.connection.createDataChannel('chat-events'))
  }

  return peer
}

export function closePeerConnection(peer: PeerConnectionState): void {
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
