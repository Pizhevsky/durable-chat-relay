import { io, type Socket } from 'socket.io-client'
import type {
  AppConfig,
  ChatEvent,
  ChatSummary,
  PeerDirectorySnapshot,
  PeerSignalMessage,
  PeerSignalPayload,
  SyncResponse,
  UserId
} from '../../../../shared/types'
import { clientConfig } from '../../config/clientConfig'
import { apiOrigin } from '../../services/runtimeConfig'

export type PresenceSnapshot = Record<UserId, boolean>

interface PendingPeerSignal {
  toUserId: UserId
  signal: PeerSignalPayload
}

export function useSocketConnection(input: {
  deviceId: string
  getUserId: () => string
  onEvent: (event: ChatEvent) => void
  onChats: (chats: ChatSummary[]) => void
  onConnectionLabel: (label: string) => void
  onConnected?: () => void
  onPeerSignal?: (message: PeerSignalMessage) => void
  onPeerDirectory?: (directory: PeerDirectorySnapshot) => void
  onPresence?: (presence: PresenceSnapshot) => void
}) {
  let socket: Socket | null = null
  let lastConfig: AppConfig | null = null
  let localTransportPaused = false
  let isSessionReady = false
  const pendingPeerSignals: PendingPeerSignal[] = []

  function connect(config: AppConfig): void {
    lastConfig = config

    closeSocket()
    isSessionReady = false
    socket = io(apiOrigin(), { transports: ['websocket', 'polling'] })

    socket.on('connect', () => {
      if (localTransportPaused) {
        input.onConnectionLabel('Local-only mode, peer signaling available')
      } else {
        input.onConnectionLabel(
          config.nodeRole === 'helper'
            ? 'Connected through helper node'
            : 'Connected to central server'
        )
      }
      socket?.emit('client:hello', {
        userId: input.getUserId(),
        deviceId: input.deviceId,
        localOnly: localTransportPaused
      })
    })

    socket.on('disconnect', () => {
      isSessionReady = false
      if (!localTransportPaused) input.onConnectionLabel('Offline, saving locally')
    })

    socket.on('chat:list', (chats) => {
      isSessionReady = true
      if (!localTransportPaused) input.onChats(chats)
      flushPeerSignals()
      if (!localTransportPaused) input.onConnected?.()
    })
    socket.on('event:applied', (event) => {
      if (!localTransportPaused) input.onEvent(event)
    })
    socket.on('peer:signal', input.onPeerSignal ?? (() => undefined))
    socket.on('peer:directory', input.onPeerDirectory ?? (() => undefined))
    socket.on('presence:update', input.onPresence ?? (() => undefined))
  }

  function reconnectUser(): void {
    if (!socket?.connected) return
    clearPendingPeerSignals()
    isSessionReady = false
    socket.emit('client:hello', {
      userId: input.getUserId(),
      deviceId: input.deviceId,
      localOnly: localTransportPaused
    })
  }

  function setLocalTransportPaused(enabled: boolean): void {
    localTransportPaused = enabled

    if (socket?.connected && isSessionReady) {
      socket.emit('client:mode', { localOnly: enabled })
    }

    if (enabled) {
      input.onConnectionLabel(
        socket?.connected
          ? 'Local-only mode, peer signaling available'
          : 'Local-only mode, saving to IndexedDB'
      )
      if (!socket && lastConfig) connect(lastConfig)
      return
    }

    if (lastConfig) connect(lastConfig)
  }

  function publishEvent(event: ChatEvent): Promise<ChatEvent> {
    return new Promise((resolve, reject) => {
      if (localTransportPaused) {
        reject(new Error('Local-only mode is enabled'))
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

  function syncEvents(events: ChatEvent[]): Promise<SyncResponse> {
    return new Promise((resolve, reject) => {
      if (localTransportPaused) {
        reject(new Error('Local-only mode is enabled'))
        return
      }

      if (!socket?.connected || !isSessionReady) {
        reject(new Error('Socket session is not ready'))
        return
      }

      socket.emit('sync:events', events, (response: SyncResponse & { ok?: boolean; error?: string }) => {
        if (response.ok === false) reject(new Error(response.error ?? 'Event sync failed'))
        else resolve(response)
      })
    })
  }

  function sendPeerSignal(toUserId: UserId, signal: PeerSignalPayload): void {
    if (!socket?.connected || !isSessionReady) {
      queuePeerSignal(toUserId, signal)
      return
    }

    socket.emit('peer:signal', { toUserId, signal })
  }

  function queuePeerSignal(toUserId: UserId, signal: PeerSignalPayload): void {
    pendingPeerSignals.push({ toUserId, signal })
    if (pendingPeerSignals.length > clientConfig.peer.maxPendingSignals) pendingPeerSignals.shift()
  }

  function flushPeerSignals(): void {
    if (!socket?.connected || !isSessionReady) return

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
    setLocalTransportPaused,
    publishEvent,
    syncEvents,
    sendPeerSignal,
    isConnected: () => Boolean(socket?.connected) && isSessionReady && !localTransportPaused,
    close
  }
}
