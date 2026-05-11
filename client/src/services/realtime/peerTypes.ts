import type { 
  ChatEvent,
  DeviceId,
  EventId,
  PeerSignalMessage,
  PeerSignalPayload,
  UserId
} from '../../../../shared/types'

export interface PeerMeshInput {
  deviceId: string
  currentUserId: () => UserId
  sendSignal: (toUserId: UserId, signal: PeerSignalPayload) => void
  getEventsForPeer: (peerUserId: UserId) => Promise<ChatEvent[]>
  getEventsByIdsForPeer: (eventIds: EventId[], peerUserId: UserId) => Promise<ChatEvent[]>
  getTargetUserIds?: (event: ChatEvent) => UserId[]
  onEvent: (event: ChatEvent, fromDeviceId: DeviceId) => boolean | Promise<boolean>
  onPeerAck?: (eventId: EventId, peerDeviceId: DeviceId) => void | Promise<void>
  onPeerEvent?: (event: ChatEvent) => void
  onMissingSync?: (status: string) => void
  onStatus?: (status: string) => void
}

export interface PeerMesh {
  updatePeers: (userIds: UserId[]) => void
  handleSignal: (message: PeerSignalMessage) => Promise<void>
  publishEvent: (event: ChatEvent, targetUserIds: UserId[]) => void
  close: () => void
}

export interface PeerConnectionState {
  userId: UserId
  deviceId?: DeviceId
  connection: RTCPeerConnection
  channel?: RTCDataChannel
  pendingCandidates: RTCIceCandidateInit[]
  makingOffer: boolean
  polite: boolean
}

export type PeerDataMessage =
  | { type: 'event:new'; event: ChatEvent }
  | { type: 'event:batch'; events: ChatEvent[] }
  | { type: 'event:ack'; eventId: EventId; deviceId: DeviceId }
  | { type: 'event:summary'; eventIds: EventId[]; deviceId: DeviceId }
  | { type: 'event:request-missing'; eventIds: EventId[]; deviceId: DeviceId }
