import type { PeerIceCandidate, PeerSessionDescription } from '../../../../shared/types'
import { clientConfig } from '../../config/clientConfig'

export const ICE_SERVERS: RTCIceServer[] = clientConfig.peer.defaultIceServers

export function supportsWebRtc(): boolean {
  return typeof RTCPeerConnection !== 'undefined'
}

export function sessionDescription(connection: RTCPeerConnection): PeerSessionDescription {
  const description = connection.localDescription
  if (!description) throw new Error('WebRTC local description is not available')

  return {
    type: description.type,
    sdp: description.sdp
  }
}

export function iceCandidate(candidate: RTCIceCandidate): PeerIceCandidate {
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment
  }
}
