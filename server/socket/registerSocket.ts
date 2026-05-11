import type { Server, Socket } from 'socket.io'
import type { ChatEvent, DeviceId, MemberChangedPayload, PeerDirectorySnapshot, UserId } from '../../shared/types.js'
import type { ChatEventService } from '../services/ChatEventService.js'
import { serverConfig } from '../config.js'

interface ClientSession {
  userId: UserId
  deviceId: DeviceId
  localOnly: boolean
  lastSeenAt: string
}

export interface SocketEventEmitter {
  emitAppliedEvent: (event: ChatEvent) => void
}

export function registerSocketHandlers(io: Server, service: ChatEventService): SocketEventEmitter {
  const sessions = new Map<string, ClientSession>()
  const userSockets = new Map<UserId, Set<string>>()

  function addUserSocket(userId: UserId, socketId: string): void {
    const sockets = userSockets.get(userId) ?? new Set<string>()
    sockets.add(socketId)
    userSockets.set(userId, sockets)
  }

  function removeUserSocket(userId: UserId, socketId: string): void {
    const sockets = userSockets.get(userId)
    if (!sockets) return
    sockets.delete(socketId)
    if (sockets.size === 0) userSockets.delete(userId)
  }

  function emitToUser(userId: UserId, eventName: string, payload: unknown): void {
    const sockets = userSockets.get(userId)
    if (!sockets) return
    for (const socketId of sockets) io.to(socketId).emit(eventName, payload)
  }

  function joinUserToChat(userId: UserId, chatId: string): void {
    const sockets = userSockets.get(userId)
    if (!sockets) return
    for (const socketId of sockets) {
      const connectedSocket = io.sockets.sockets.get(socketId)
      connectedSocket?.join(chatId)
    }
  }

  function leaveUserFromChat(userId: UserId, chatId: string): void {
    const sockets = userSockets.get(userId)
    if (!sockets) return
    for (const socketId of sockets) {
      const connectedSocket = io.sockets.sockets.get(socketId)
      connectedSocket?.leave(chatId)
    }
  }
  function leaveSocketChatRooms(socket: Socket): void {
    for (const room of socket.rooms) {
      if (room !== socket.id) socket.leave(room)
    }
  }

  function joinActiveMembers(chatId: string): void {
    for (const memberId of service.getActiveMemberIds(chatId)) {
      joinUserToChat(memberId, chatId)
    }
  }

  function emitEventToActiveMembers(event: ChatEvent, extraUserIds: UserId[] = []): void {
    const targetSocketIds = new Set<string>()

    for (const memberId of [...service.getActiveMemberIds(event.chatId), ...extraUserIds]) {
      const sockets = userSockets.get(memberId)
      if (!sockets) continue
      for (const socketId of sockets) targetSocketIds.add(socketId)
    }

    for (const socketId of targetSocketIds) {
      io.to(socketId).emit('event:applied', event)
    }
  }

  function emitAppliedEvent(event: ChatEvent): void {
    if (event.type === 'chat.created') {
      joinActiveMembers(event.chatId)
      emitEventToActiveMembers(event)
      broadcastPeerDirectories()
      return
    }

    if (event.type === 'member.added') {
      const payload = event.payload as MemberChangedPayload
      joinUserToChat(payload.memberId, event.chatId)
      emitEventToActiveMembers(event)
      broadcastPeerDirectories()
      return
    }

    if (event.type === 'member.removed') {
      const payload = event.payload as MemberChangedPayload
      emitEventToActiveMembers(event, [payload.memberId])
      leaveUserFromChat(payload.memberId, event.chatId)
      broadcastPeerDirectories()
      return
    }

    emitEventToActiveMembers(event)
  }

  function presenceSnapshot(): Record<UserId, boolean> {
    return Object.fromEntries([...userSockets.keys()].map((userId) => [userId, true]))
  }

  function peerDirectoryForUser(userId: UserId): PeerDirectorySnapshot {
    const peers = [...new Set([...sessions.values()].map((session) => session.userId))]
      .filter((peerUserId) => peerUserId !== userId && service.usersShareActiveChat(userId, peerUserId))
      .map((peerUserId) => {
        const peerSessions = [...sessions.values()].filter((session) => session.userId === peerUserId)
        const lastSeenAt = peerSessions
          .map((session) => session.lastSeenAt)
          .sort()
          .at(-1) ?? new Date().toISOString()

        return {
          userId: peerUserId,
          deviceIds: [...new Set(peerSessions.map((session) => session.deviceId))],
          isOnline: peerSessions.length > 0,
          isLocalOnly: peerSessions.some((session) => session.localOnly),
          lastSeenAt
        }
      })

    return { peers, generatedAt: new Date().toISOString() }
  }

  function emitPeerDirectory(userId: UserId): void {
    emitToUser(userId, 'peer:directory', peerDirectoryForUser(userId))
  }

  function broadcastPeerDirectories(): void {
    for (const userId of userSockets.keys()) emitPeerDirectory(userId)
  }

  function broadcastPresenceAndPeerDirectories(): void {
    io.emit('presence:update', presenceSnapshot())
    broadcastPeerDirectories()
  }

  function requireSession(socket: Socket): ClientSession {
    const session = sessions.get(socket.id)
    if (!session) throw new Error('Socket is not initialised with client:hello')
    return session
  }

  io.on('connection', (socket) => {
    socket.emit('node:hello', {
      nodeRole: serverConfig.nodeRole,
      nodeId: serverConfig.nodeId,
      centralUrl: serverConfig.centralUrl ?? null
    })

    socket.on('client:hello', ({ userId, deviceId, localOnly }: ClientSession) => {
      const previousSession = sessions.get(socket.id)
      if (previousSession?.userId && previousSession.userId !== userId) {
        removeUserSocket(previousSession.userId, socket.id)
        leaveSocketChatRooms(socket)
      }

      sessions.set(socket.id, {
        userId,
        deviceId,
        localOnly: Boolean(localOnly),
        lastSeenAt: new Date().toISOString()
      })
      addUserSocket(userId, socket.id)

      const chats = service.listChats(userId)
      for (const chat of chats) socket.join(chat.id)

      socket.emit('chat:list', chats)
      broadcastPresenceAndPeerDirectories()
    })

    socket.on('event:publish', (event: ChatEvent, callback?: (response: unknown) => void) => {
      try {
        const session = requireSession(socket)
        const trustedEvent: ChatEvent = {
          ...event,
          actorUserId: session.userId,
          originDeviceId: session.deviceId,
          originNodeId: event.originNodeId || serverConfig.nodeId
        }

        const result = service.applyEvent(trustedEvent)
        emitAppliedEvent(result.event)
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
        requireSession(socket)
        const result = service.applyEvents(events)
        for (const event of result.serverEvents) emitAppliedEvent(event)
        callback?.({ ok: true, ...result })
      } catch (error) {
        callback?.({ ok: false, error: error instanceof Error ? error.message : 'Unknown sync error' })
      }
    })

    socket.on('client:mode', ({ localOnly }: { localOnly?: unknown }) => {
      const session = requireSession(socket)
      session.localOnly = Boolean(localOnly)
      session.lastSeenAt = new Date().toISOString()
      sessions.set(socket.id, session)
      broadcastPeerDirectories()
    })

    socket.on('peer:signal', ({ toUserId, signal }: { toUserId?: unknown; signal?: unknown }) => {
      const session = requireSession(socket)
      if (typeof toUserId !== 'string') return
      if (session.userId === toUserId || !userSockets.has(toUserId)) return
      if (!service.usersShareActiveChat(session.userId, toUserId)) return

      emitToUser(toUserId, 'peer:signal', {
        fromUserId: session.userId,
        fromDeviceId: session.deviceId,
        signal
      })
    })

    socket.on('disconnect', () => {
      const session = sessions.get(socket.id)
      sessions.delete(socket.id)
      if (session) removeUserSocket(session.userId, socket.id)
      broadcastPresenceAndPeerDirectories()
    })
  })

  return { emitAppliedEvent }
}
