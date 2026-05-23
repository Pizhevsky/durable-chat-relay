import type { Socket } from 'socket.io'
import type { DeviceId, UserId } from '../../shared/types.js'

export interface ClientSession {
  userId: UserId
  deviceId: DeviceId
  localOnly: boolean
  lastSeenAt: string
}

export class SocketSessionRegistry {
  private readonly sessions = new Map<string, ClientSession>()
  private readonly userSockets = new Map<UserId, Set<string>>()

  setSession(socket: Socket, session: ClientSession): ClientSession | undefined {
    const previousSession = this.sessions.get(socket.id)
    if (previousSession?.userId && previousSession.userId !== session.userId) {
      this.removeUserSocket(previousSession.userId, socket.id)
      this.leaveSocketChatRooms(socket)
    }

    this.sessions.set(socket.id, session)
    this.addUserSocket(session.userId, socket.id)
    return previousSession
  }

  updateSession(socketId: string, session: ClientSession): void {
    this.sessions.set(socketId, session)
  }

  removeSession(socketId: string): ClientSession | undefined {
    const session = this.sessions.get(socketId)
    this.sessions.delete(socketId)
    if (session) this.removeUserSocket(session.userId, socketId)
    return session
  }

  requireSession(socket: Socket): ClientSession {
    const session = this.sessions.get(socket.id)
    if (!session) throw new Error('Socket is not initialised with client:hello')
    return session
  }

  getUserSocketIds(userId: UserId): Set<string> | undefined {
    return this.userSockets.get(userId)
  }

  hasUser(userId: UserId): boolean {
    return this.userSockets.has(userId)
  }

  userIds(): IterableIterator<UserId> {
    return this.userSockets.keys()
  }

  allSessions(): ClientSession[] {
    return [...this.sessions.values()]
  }

  sessionsForUser(userId: UserId): ClientSession[] {
    return this.allSessions().filter((session) => session.userId === userId)
  }

  presenceSnapshot(): Record<UserId, boolean> {
    return Object.fromEntries([...this.userSockets.keys()].map((userId) => [userId, true]))
  }

  private addUserSocket(userId: UserId, socketId: string): void {
    const sockets = this.userSockets.get(userId) ?? new Set<string>()
    sockets.add(socketId)
    this.userSockets.set(userId, sockets)
  }

  private removeUserSocket(userId: UserId, socketId: string): void {
    const sockets = this.userSockets.get(userId)
    if (!sockets) return
    sockets.delete(socketId)
    if (sockets.size === 0) this.userSockets.delete(userId)
  }

  private leaveSocketChatRooms(socket: Socket): void {
    for (const room of socket.rooms) {
      if (room !== socket.id) socket.leave(room)
    }
  }
}
