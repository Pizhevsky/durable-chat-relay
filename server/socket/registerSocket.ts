import type { Server } from 'socket.io'
import type { ChatEvent } from '../../shared/types.js'
import { serverConfig } from '../config.js'
import type { ChatEventService } from '../services/ChatEventService.js'
import { ChatRoomBroadcaster } from './ChatRoomBroadcaster.js'
import { PeerDirectoryPublisher } from './PeerDirectoryPublisher.js'
import { SocketSessionRegistry, type ClientSession } from './SocketSessionRegistry.js'

export interface SocketEventEmitter {
  emitAppliedEvent: (event: ChatEvent) => void
}

export function registerSocketHandlers(io: Server, service: ChatEventService): SocketEventEmitter {
  const registry = new SocketSessionRegistry()
  let peerDirectoryPublisher: PeerDirectoryPublisher
  const broadcaster = new ChatRoomBroadcaster(io, service, registry, () => {
    peerDirectoryPublisher.broadcastPeerDirectories()
  })
  peerDirectoryPublisher = new PeerDirectoryPublisher(io, service, registry, broadcaster)

  io.on('connection', (socket) => {
    socket.emit('node:hello', {
      nodeRole: serverConfig.nodeRole,
      nodeId: serverConfig.nodeId,
      centralUrl: serverConfig.centralUrl ?? null
    })

    socket.on('client:hello', ({ userId, deviceId, localOnly }: ClientSession) => {
      registry.setSession(socket, {
        userId,
        deviceId,
        localOnly: Boolean(localOnly),
        lastSeenAt: new Date().toISOString()
      })

      const chats = service.listChats(userId)
      for (const chat of chats) socket.join(chat.id)

      socket.emit('chat:list', chats)
      peerDirectoryPublisher.broadcastPresenceAndPeerDirectories()
    })

    socket.on('event:publish', (event: ChatEvent, callback?: (response: unknown) => void) => {
      try {
        const session = registry.requireSession(socket)
        const trustedEvent: ChatEvent = {
          ...event,
          actorUserId: session.userId,
          originDeviceId: session.deviceId,
          originNodeId: event.originNodeId || serverConfig.nodeId
        }

        const result = service.applyEvent(trustedEvent)
        broadcaster.emitAppliedEvent(result.event)
        callback?.({ ok: true, event: result.event, duplicate: !result.inserted })
      } catch (error) {
        callback?.({ ok: false, error: error instanceof Error ? error.message : 'Unknown socket error' })
      }
    })

    socket.on('sync:events', (events: ChatEvent[], callback?: (response: unknown) => void) => {
      try {
        // A connected browser/helper may sync events originally authored by other devices.
        // We require a session to avoid anonymous injection, but preserve actorUserId so
        // peer/helper/recovery replication does not rewrite event authorship.
        registry.requireSession(socket)
        const result = service.applyEvents(events)
        for (const event of result.serverEvents) broadcaster.emitAppliedEvent(event)
        callback?.({ ok: true, ...result })
      } catch (error) {
        callback?.({ ok: false, error: error instanceof Error ? error.message : 'Unknown sync error' })
      }
    })

    socket.on('client:mode', ({ localOnly }: { localOnly?: unknown }) => {
      const session = registry.requireSession(socket)
      session.localOnly = Boolean(localOnly)
      session.lastSeenAt = new Date().toISOString()
      registry.updateSession(socket.id, session)
      peerDirectoryPublisher.broadcastPeerDirectories()
    })

    socket.on('peer:signal', ({ toUserId, signal }: { toUserId?: unknown; signal?: unknown }) => {
      const session = registry.requireSession(socket)
      if (typeof toUserId !== 'string') return
      if (session.userId === toUserId || !registry.hasUser(toUserId)) return
      if (!service.usersShareActiveChat(session.userId, toUserId)) return

      broadcaster.emitToUser(toUserId, 'peer:signal', {
        fromUserId: session.userId,
        fromDeviceId: session.deviceId,
        signal
      })
    })

    socket.on('disconnect', () => {
      registry.removeSession(socket.id)
      peerDirectoryPublisher.broadcastPresenceAndPeerDirectories()
    })
  })

  return { emitAppliedEvent: broadcaster.emitAppliedEvent.bind(broadcaster) }
}
