import type Database from 'better-sqlite3'
import type {
  ChatCreatedPayload,
  ChatEvent,
  ChatId,
  MemberChangedPayload,
  MessageCreatedPayload,
  MessageReadPayload,
  UserId
} from '../../shared/types.js'
import { AppError } from '../errors.js'
import { canonicalDirectPairKey } from './chatEventFormatters.js'
import type { ChatRow } from './chatEventRows.js'

export class ChatEventProjector {
  constructor(private readonly db: Database.Database) {}

  projectEvent(event: ChatEvent): void {
    switch (event.type) {
      case 'chat.created':
        this.projectChatCreated(event as ChatEvent<ChatCreatedPayload>)
        break
      case 'member.added':
        this.projectMemberAdded(event as ChatEvent<MemberChangedPayload>)
        break
      case 'member.removed':
        this.projectMemberRemoved(event as ChatEvent<MemberChangedPayload>)
        break
      case 'message.created':
        this.projectMessageCreated(event as ChatEvent<MessageCreatedPayload>)
        break
      case 'message.read':
        this.projectMessageRead(event as ChatEvent<MessageReadPayload>)
        break
      default:
        throw new AppError(`Unsupported event type: ${event.type}`, 422, 'UNSUPPORTED_EVENT')
    }
  }

  private projectChatCreated(event: ChatEvent<ChatCreatedPayload>): void {
    const payload = event.payload
    const memberIds = Array.from(new Set([event.actorUserId, ...payload.memberIds]))
    const title = payload.title?.trim() || null
    const directPairKey = payload.type === 'direct' ? canonicalDirectPairKey(memberIds) : null

    if (payload.type === 'direct' && memberIds.length !== 2) {
      throw new AppError('Direct chats must contain exactly two unique users', 422, 'INVALID_DIRECT_CHAT')
    }

    if (directPairKey) {
      const existing = this.db
        .prepare('SELECT id FROM chats WHERE direct_pair_key = ?')
        .get(directPairKey) as { id: string } | undefined
      if (existing) {
        throw new AppError('A direct chat for this pair already exists', 409, 'DIRECT_CHAT_EXISTS')
      }
    }

    this.db.prepare(`
      INSERT INTO chats (id, client_chat_id, direct_pair_key, type, title, created_by, created_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.chatId,
      payload.clientChatId ?? null,
      directPairKey,
      payload.type,
      title,
      event.actorUserId,
      event.createdAt,
      event.syncStatus
    )

    const insertMember = this.db.prepare(`
      INSERT INTO chat_members (chat_id, user_id, joined_at, left_at, is_owner)
      VALUES (?, ?, ?, NULL, ?)
      ON CONFLICT(chat_id, user_id) DO UPDATE SET left_at = NULL
    `)

    for (const memberId of memberIds) {
      this.assertUserExists(memberId)
      insertMember.run(payload.chatId, memberId, event.createdAt, memberId === event.actorUserId ? 1 : 0)
    }
  }

  private projectMemberAdded(event: ChatEvent<MemberChangedPayload>): void {
    this.assertGroupOwner(event.payload.chatId, event.actorUserId)
    this.assertUserExists(event.payload.memberId)

    this.db.prepare(`
      INSERT INTO chat_members (chat_id, user_id, joined_at, left_at, is_owner)
      VALUES (?, ?, ?, NULL, 0)
      ON CONFLICT(chat_id, user_id) DO UPDATE SET left_at = NULL
    `).run(event.payload.chatId, event.payload.memberId, event.createdAt)
  }

  private projectMemberRemoved(event: ChatEvent<MemberChangedPayload>): void {
    this.assertGroupOwner(event.payload.chatId, event.actorUserId)

    const chat = this.getChat(event.payload.chatId)
    if (chat.type === 'direct') {
      throw new AppError('Direct chats cannot be left or reduced in outage mode', 422, 'DIRECT_CHAT_LOCKED')
    }

    if (event.payload.memberId === event.actorUserId) {
      throw new AppError('Owners cannot remove themselves in this demo', 422, 'OWNER_CANNOT_LEAVE')
    }

    this.db.prepare(`
      UPDATE chat_members
      SET left_at = ?
      WHERE chat_id = ? AND user_id = ? AND is_owner = 0
    `).run(event.createdAt, event.payload.chatId, event.payload.memberId)
  }

  private projectMessageCreated(event: ChatEvent<MessageCreatedPayload>): void {
    this.assertActiveMember(event.payload.chatId, event.actorUserId)

    this.db.prepare(`
      INSERT INTO messages (id, client_message_id, chat_id, sender_id, text, created_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.payload.messageId,
      event.payload.clientMessageId,
      event.payload.chatId,
      event.actorUserId,
      event.payload.text,
      event.createdAt,
      event.syncStatus
    )

    this.db.prepare(`
      INSERT OR IGNORE INTO message_reads (message_id, user_id, read_at)
      VALUES (?, ?, ?)
    `).run(event.payload.messageId, event.actorUserId, event.createdAt)
  }

  private projectMessageRead(event: ChatEvent<MessageReadPayload>): void {
    this.assertActiveMember(event.payload.chatId, event.actorUserId)

    this.db.prepare(`
      INSERT OR IGNORE INTO message_reads (message_id, user_id, read_at)
      VALUES (?, ?, ?)
    `).run(event.payload.messageId, event.actorUserId, event.createdAt)
  }

  private getChat(chatId: ChatId): ChatRow {
    const chat = this.db.prepare(`
      SELECT id, client_chat_id, direct_pair_key, type, title, created_by, created_at, sync_status
      FROM chats
      WHERE id = ?
    `).get(chatId) as ChatRow | undefined
    if (!chat) throw new AppError('Chat not found', 404, 'CHAT_NOT_FOUND')
    return chat
  }

  private assertUserExists(userId: UserId): void {
    const user = this.db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (!user) throw new AppError(`Unknown user: ${userId}`, 404, 'USER_NOT_FOUND')
  }

  private assertActiveMember(chatId: ChatId, userId: UserId): void {
    const member = this.db.prepare(`
      SELECT user_id FROM chat_members
      WHERE chat_id = ? AND user_id = ? AND left_at IS NULL
    `).get(chatId, userId)

    if (!member) throw new AppError('User is not an active chat member', 403, 'NOT_CHAT_MEMBER')
  }

  private assertGroupOwner(chatId: ChatId, userId: UserId): void {
    const chat = this.getChat(chatId)
    if (chat.type !== 'group') {
      throw new AppError('Membership changes are only supported for group chats', 422, 'NOT_GROUP_CHAT')
    }

    const owner = this.db.prepare(`
      SELECT user_id FROM chat_members
      WHERE chat_id = ? AND user_id = ? AND left_at IS NULL AND is_owner = 1
    `).get(chatId, userId)

    if (!owner) throw new AppError('Only the group owner can change members', 403, 'NOT_GROUP_OWNER')
  }
}
