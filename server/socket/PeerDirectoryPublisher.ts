import type { Server } from 'socket.io'
import type { PeerDirectorySnapshot, UserId } from '../../shared/types.js'
import type { ChatEventService } from '../services/ChatEventService.js'
import type { ChatRoomBroadcaster } from './ChatRoomBroadcaster.js'
import type { SocketSessionRegistry } from './SocketSessionRegistry.js'

export class PeerDirectoryPublisher {
  constructor(
    private readonly io: Server,
    private readonly service: ChatEventService,
    private readonly registry: SocketSessionRegistry,
    private readonly broadcaster: ChatRoomBroadcaster
  ) {}

  broadcastPresenceAndPeerDirectories(): void {
    this.io.emit('presence:update', this.registry.presenceSnapshot())
    this.broadcastPeerDirectories()
  }

  broadcastPeerDirectories(): void {
    for (const userId of this.registry.userIds()) this.emitPeerDirectory(userId)
  }

  private emitPeerDirectory(userId: UserId): void {
    this.broadcaster.emitToUser(userId, 'peer:directory', this.peerDirectoryForUser(userId))
  }

  private peerDirectoryForUser(userId: UserId): PeerDirectorySnapshot {
    const peers = [...new Set(this.registry.allSessions().map((session) => session.userId))]
      .filter((peerUserId) => peerUserId !== userId && this.service.usersShareActiveChat(userId, peerUserId))
      .map((peerUserId) => {
        const peerSessions = this.registry.sessionsForUser(peerUserId)
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
}
