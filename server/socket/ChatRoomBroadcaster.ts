import type { Server } from 'socket.io'
import type { ChatEvent, MemberChangedPayload, UserId } from '../../shared/types.js'
import type { ChatEventService } from '../services/ChatEventService.js'
import type { SocketSessionRegistry } from './SocketSessionRegistry.js'

export class ChatRoomBroadcaster {
  constructor(
    private readonly io: Server,
    private readonly service: ChatEventService,
    private readonly registry: SocketSessionRegistry,
    private readonly onMembershipChanged: () => void
  ) {}

  emitToUser(userId: UserId, eventName: string, payload: unknown): void {
    const sockets = this.registry.getUserSocketIds(userId)
    if (!sockets) return
    for (const socketId of sockets) this.io.to(socketId).emit(eventName, payload)
  }

  joinUserToChat(userId: UserId, chatId: string): void {
    const sockets = this.registry.getUserSocketIds(userId)
    if (!sockets) return
    for (const socketId of sockets) {
      const connectedSocket = this.io.sockets.sockets.get(socketId)
      connectedSocket?.join(chatId)
    }
  }

  emitAppliedEvent(event: ChatEvent): void {
    if (event.type === 'chat.created') {
      this.joinActiveMembers(event.chatId)
      this.emitEventToActiveMembers(event)
      this.onMembershipChanged()
      return
    }

    if (event.type === 'member.added') {
      const payload = event.payload as MemberChangedPayload
      this.joinUserToChat(payload.memberId, event.chatId)
      this.emitEventToActiveMembers(event)
      this.onMembershipChanged()
      return
    }

    if (event.type === 'member.removed') {
      const payload = event.payload as MemberChangedPayload
      this.emitEventToActiveMembers(event, [payload.memberId])
      this.leaveUserFromChat(payload.memberId, event.chatId)
      this.onMembershipChanged()
      return
    }

    this.emitEventToActiveMembers(event)
  }

  private leaveUserFromChat(userId: UserId, chatId: string): void {
    const sockets = this.registry.getUserSocketIds(userId)
    if (!sockets) return
    for (const socketId of sockets) {
      const connectedSocket = this.io.sockets.sockets.get(socketId)
      connectedSocket?.leave(chatId)
    }
  }

  private joinActiveMembers(chatId: string): void {
    for (const memberId of this.service.getActiveMemberIds(chatId)) {
      this.joinUserToChat(memberId, chatId)
    }
  }

  private emitEventToActiveMembers(event: ChatEvent, extraUserIds: UserId[] = []): void {
    const targetSocketIds = new Set<string>()

    for (const memberId of [...this.service.getActiveMemberIds(event.chatId), ...extraUserIds]) {
      const sockets = this.registry.getUserSocketIds(memberId)
      if (!sockets) continue
      for (const socketId of sockets) targetSocketIds.add(socketId)
    }

    for (const socketId of targetSocketIds) {
      this.io.to(socketId).emit('event:applied', event)
    }
  }
}
