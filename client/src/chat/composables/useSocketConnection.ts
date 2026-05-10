import { io, type Socket } from 'socket.io-client'
import type {
  AppConfig,
  ChatEvent,
  ChatSummary,
  PeerSignalMessage,
  PeerSignalPayload,
  UserId
} from '../../../../shared/types'
import { apiOrigin } from '../../services/runtimeConfig'

export type PresenceSnapshot = Record<UserId, boolean>

interface PendingPeerSignal {
  toUserId: UserId
  signal: PeerSignalPayload
}

const MAX_PENDING_PEER_SIGNALS = 100

export function useSocketConnection(input: {
  deviceId: string
  getUserId: () => string
  onEvent: (event: ChatEvent) => void
  onChats: (chats: ChatSummary[]) => void
  onConnectionLabel: (label: string) => void
  onConnected?: () => void
  onPeerSignal?: (message: PeerSignalMessage) => void
  onPresence?: (presence: PresenceSnapshot) => void
}) {
  let socket: Socket | null = null
  let lastConfig: AppConfig | null = null
  let demoLocalOnly = false
  let isSessionReady = false
  const pendingPeerSignals: PendingPeerSignal[] = []

  function connect(config: AppConfig): void {
    lastConfig = config
    if (demoLocalOnly) return

    closeSocket()
    isSessionReady = false
    socket = io(apiOrigin(), { transports: ['websocket', 'polling'] })

    socket.on('connect', () => {
      input.onConnectionLabel(
        config.nodeRole === 'helper'
          ? 'Connected through helper node'
          : 'Connected to central server'
      )
      socket?.emit('client:hello', {
        userId: input.getUserId(),
        deviceId: input.deviceId
      })
      input.onConnected?.()
    })

    socket.on('disconnect', () => {
      isSessionReady = false
      if (!demoLocalOnly) input.onConnectionLabel('Offline, saving locally')
    })

    socket.on('chat:list', (chats) => {
      isSessionReady = true
      input.onChats(chats)
      flushPeerSignals()
    })
    socket.on('event:applied', input.onEvent)
    socket.on('peer:signal', input.onPeerSignal ?? (() => undefined))
    socket.on('presence:update', input.onPresence ?? (() => undefined))
  }

  function reconnectUser(): void {
    if (!socket?.connected) return
    clearPendingPeerSignals()
    isSessionReady = false
    socket.emit('client:hello', {
      userId: input.getUserId(),
      deviceId: input.deviceId
    })
  }

  function setDemoLocalOnly(enabled: boolean): void {
    demoLocalOnly = enabled

    if (enabled) {
      clearPendingPeerSignals()
      isSessionReady = false
      closeSocket()
      input.onConnectionLabel('Demo local-only mode, saving to IndexedDB')
      return
    }

    if (lastConfig) connect(lastConfig)
  }

  function publishEvent(event: ChatEvent): Promise<ChatEvent> {
    return new Promise((resolve, reject) => {
      if (demoLocalOnly) {
        reject(new Error('Demo local-only mode is enabled'))
        return
      }

      if (!socket?.connected) {
        reject(new Error('Socket is not connected'))
        return
      }

      socket.emit('event:publish', event, (response: { ok: boolean; event?: ChatEvent; error?: string }) => {
        if (!response.ok || !response.event) reject(new Error(response.error ?? 'Event publish failed'))
        else resolve(response.event)
      })
    })
  }

  function sendPeerSignal(toUserId: UserId, signal: PeerSignalPayload): void {
    if (demoLocalOnly) return

    if (!socket?.connected || !isSessionReady) {
      queuePeerSignal(toUserId, signal)
      return
    }

    socket.emit('peer:signal', { toUserId, signal })
  }

  function queuePeerSignal(toUserId: UserId, signal: PeerSignalPayload): void {
    pendingPeerSignals.push({ toUserId, signal })
    if (pendingPeerSignals.length > MAX_PENDING_PEER_SIGNALS) pendingPeerSignals.shift()
  }

  function flushPeerSignals(): void {
    if (demoLocalOnly || !socket?.connected || !isSessionReady) return

    const signals = pendingPeerSignals.splice(0)
    for (const { toUserId, signal } of signals) {
      socket.emit('peer:signal', { toUserId, signal })
    }
  }

  function clearPendingPeerSignals(): void {
    pendingPeerSignals.splice(0)
  }

  function closeSocket(): void {
    if (!socket) return
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
    isSessionReady = false
  }

  function close(): void {
    clearPendingPeerSignals()
    closeSocket()
  }

  return {
    connect,
    reconnectUser,
    setDemoLocalOnly,
    publishEvent,
    sendPeerSignal,
    isConnected: () => Boolean(socket?.connected) && !demoLocalOnly,
    close
  }
}
