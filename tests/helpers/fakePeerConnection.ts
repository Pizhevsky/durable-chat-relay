import type { UserId } from '../../shared/types'

export class FakeDataChannel {
  readyState = 'open'
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((message: { data: unknown }) => void) | null = null

  send(value: string): void {
    this.sent.push(value)
  }
}

export function decodePeerMessages(channel: FakeDataChannel): Array<Record<string, unknown>> {
  return channel.sent.map((message) => JSON.parse(message) as Record<string, unknown>)
}

export function installFakePeerConnection(
  pendingPeerIds: UserId[],
  channels: Map<UserId, FakeDataChannel>
): void {
  let currentPeerId = ''

  class FakePeerConnection {
    localDescription: RTCSessionDescription | null = null
    remoteDescription: RTCSessionDescription | null = null
    signalingState: RTCSignalingState = 'stable'
    connectionState: RTCPeerConnectionState = 'new'
    ondatachannel: ((event: { channel: FakeDataChannel }) => void) | null = null
    onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null
    onnegotiationneeded: (() => void) | null = null
    onconnectionstatechange: (() => void) | null = null

    createDataChannel(_label: string): FakeDataChannel {
      const channel = new FakeDataChannel()
      channels.set(currentPeerId, channel)
      return channel
    }

    close(): void {
      this.connectionState = 'closed'
    }
  }

  Object.defineProperty(globalThis, 'RTCPeerConnection', {
    configurable: true,
    value: class extends FakePeerConnection {
      constructor() {
        super()
        currentPeerId = pendingPeerIds.shift() ?? ''
      }
    }
  })
}

export function restorePeerConnection(peerConnection: typeof RTCPeerConnection): void {
  Object.defineProperty(globalThis, 'RTCPeerConnection', {
    configurable: true,
    value: peerConnection
  })
}
