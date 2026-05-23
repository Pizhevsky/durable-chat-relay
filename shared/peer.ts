import type { DeviceId, EventId, UserId } from './ids.js'

export interface PeerAck {
  eventId: EventId
  peerDeviceId: DeviceId
  acknowledgedAt: string
}

export interface PeerSessionDescription {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback'
  sdp: string
}

export interface PeerIceCandidate {
  candidate: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
  usernameFragment?: string | null
}

export type PeerSignalPayload =
  | { type: 'offer'; sdp: PeerSessionDescription }
  | { type: 'answer'; sdp: PeerSessionDescription }
  | { type: 'candidate'; candidate: PeerIceCandidate }

export interface PeerDirectoryEntry {
  userId: UserId
  deviceIds: DeviceId[]
  isOnline: boolean
  isLocalOnly: boolean
  lastSeenAt: string
}

export interface PeerDirectorySnapshot {
  peers: PeerDirectoryEntry[]
  generatedAt: string
}

export interface PeerSignalMessage {
  fromUserId: UserId
  fromDeviceId: DeviceId
  signal: PeerSignalPayload
}
