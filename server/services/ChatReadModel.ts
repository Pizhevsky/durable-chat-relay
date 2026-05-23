import type Database from 'better-sqlite3'
import type {
  ChatId,
  ChatMember,
  ChatSummary,
  Message,
  MessageId,
  User,
  UserId
} from '../../shared/types.js'
import { directChatTitle } from './chatEventFormatters.js'
import type { ChatRow, MemberRow, MessageRow } from './chatEventRows.js'

export class ChatReadModel {
  constructor(private readonly db: Database.Database) {}

  listUsers(): User[] {
    return this.db.prepare('SELECT id, name, role FROM users ORDER BY name').all() as User[]
  }

  listChats(userId: UserId): ChatSummary[] {
    const rows = this.db.prepare(`
      SELECT c.id, c.client_chat_id, c.direct_pair_key, c.type, c.title, c.created_by, c.created_at, c.sync_status
      FROM chats c
      JOIN chat_members cm ON cm.chat_id = c.id
      WHERE cm.user_id = ? AND cm.left_at IS NULL
      ORDER BY c.created_at DESC
    `).all(userId) as ChatRow[]

    const chatIds = rows.map((row) => row.id)
    const membersByChat = this.getChatMembersForChats(chatIds, true)
    const lastMessagesByChat = this.getLastMessagesForChats(chatIds)
    const unreadByChat = this.getUnreadCountsForChats(chatIds, userId)

    return rows.map((row) => this.toChatSummaryFromParts(
      row,
      userId,
      membersByChat.get(row.id) ?? [],
      lastMessagesByChat.get(row.id) ?? null,
      unreadByChat.get(row.id) ?? 0
    ))
  }

  listMessages(chatId: ChatId): Message[] {
    const rows = this.db.prepare(`
      SELECT m.id, m.client_message_id, m.chat_id, m.sender_id, u.name AS sender_name,
             m.text, m.created_at, m.sync_status
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = ?
      ORDER BY m.created_at ASC
    `).all(chatId) as MessageRow[]

    return this.hydrateMessages(rows)
  }

  getActiveMemberIds(chatId: ChatId): UserId[] {
    const rows = this.db.prepare(`
      SELECT user_id FROM chat_members
      WHERE chat_id = ? AND left_at IS NULL
    `).all(chatId) as Array<{ user_id: string }>

    return rows.map((row) => row.user_id)
  }

  usersShareActiveChat(firstUserId: UserId, secondUserId: UserId): boolean {
    if (firstUserId === secondUserId) return false

    const row = this.db.prepare(`
      SELECT 1
      FROM chat_members first_member
      JOIN chat_members second_member ON second_member.chat_id = first_member.chat_id
      WHERE first_member.user_id = ?
        AND second_member.user_id = ?
        AND first_member.left_at IS NULL
        AND second_member.left_at IS NULL
      LIMIT 1
    `).get(firstUserId, secondUserId)

    return Boolean(row)
  }

  private toChatSummaryFromParts(
    row: ChatRow,
    currentUserId: UserId,
    members: ChatMember[],
    lastMessage: Message | null,
    unreadCount: number
  ): ChatSummary {
    const title = row.type === 'direct'
      ? directChatTitle(members, currentUserId)
      : row.title || 'Group chat'

    return {
      id: row.id,
      clientChatId: row.client_chat_id,
      directPairKey: row.direct_pair_key,
      type: row.type,
      title,
      createdBy: row.created_by,
      createdAt: row.created_at,
      syncStatus: row.sync_status,
      members,
      unreadCount,
      lastMessage
    }
  }

  private hydrateMessages(rows: MessageRow[]): Message[] {
    const messageIds = rows.map((row) => row.id)
    const readBy = this.getReadByForMessages(messageIds)

    return rows.map((row) => ({
      id: row.id,
      clientMessageId: row.client_message_id,
      chatId: row.chat_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      text: row.text,
      createdAt: row.created_at,
      syncStatus: row.sync_status,
      readBy: readBy.get(row.id) ?? []
    }))
  }

  private getChatMembersForChats(chatIds: ChatId[], activeOnly: boolean): Map<ChatId, ChatMember[]> {
    const membersByChat = new Map<ChatId, ChatMember[]>()
    if (chatIds.length === 0) return membersByChat

    const placeholders = chatIds.map(() => '?').join(',')
    const rows = this.db.prepare(`
      SELECT cm.chat_id, cm.user_id as userId, u.name, cm.joined_at as joinedAt,
             cm.left_at as leftAt, cm.is_owner as isOwner
      FROM chat_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.chat_id IN (${placeholders}) ${activeOnly ? 'AND cm.left_at IS NULL' : ''}
      ORDER BY cm.chat_id ASC, cm.is_owner DESC, u.name ASC
    `).all(...chatIds) as MemberRow[]

    for (const row of rows) {
      const members = membersByChat.get(row.chat_id) ?? []
      members.push({
        userId: row.userId,
        name: row.name,
        joinedAt: row.joinedAt,
        leftAt: row.leftAt,
        isOwner: Boolean(row.isOwner)
      })
      membersByChat.set(row.chat_id, members)
    }

    return membersByChat
  }

  private getLastMessagesForChats(chatIds: ChatId[]): Map<ChatId, Message> {
    const messagesByChat = new Map<ChatId, Message>()
    if (chatIds.length === 0) return messagesByChat

    const placeholders = chatIds.map(() => '?').join(',')
    const rows = this.db.prepare(`
      SELECT id, client_message_id, chat_id, sender_id, sender_name, text, created_at, sync_status
      FROM (
        SELECT m.id, m.client_message_id, m.chat_id, m.sender_id, u.name AS sender_name,
               m.text, m.created_at, m.sync_status,
               ROW_NUMBER() OVER (PARTITION BY m.chat_id ORDER BY m.created_at DESC, m.id DESC) AS rn
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.chat_id IN (${placeholders})
      ) ranked
      WHERE rn = 1
    `).all(...chatIds) as MessageRow[]

    for (const message of this.hydrateMessages(rows)) {
      messagesByChat.set(message.chatId, message)
    }

    return messagesByChat
  }

  private getUnreadCountsForChats(chatIds: ChatId[], currentUserId: UserId): Map<ChatId, number> {
    const unreadByChat = new Map<ChatId, number>()
    if (chatIds.length === 0) return unreadByChat

    const placeholders = chatIds.map(() => '?').join(',')
    const rows = this.db.prepare(`
      SELECT m.chat_id AS chatId, COUNT(*) AS count
      FROM messages m
      LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.user_id = ?
      WHERE m.chat_id IN (${placeholders}) AND m.sender_id != ? AND mr.message_id IS NULL
      GROUP BY m.chat_id
    `).all(currentUserId, ...chatIds, currentUserId) as Array<{ chatId: string; count: number }>

    for (const row of rows) unreadByChat.set(row.chatId, row.count)
    return unreadByChat
  }

  private getReadByForMessages(messageIds: MessageId[]): Map<MessageId, UserId[]> {
    const readBy = new Map<MessageId, UserId[]>()
    if (messageIds.length === 0) return readBy

    const placeholders = messageIds.map(() => '?').join(',')
    const rows = this.db.prepare(`
      SELECT message_id, user_id
      FROM message_reads
      WHERE message_id IN (${placeholders})
    `).all(...messageIds) as Array<{ message_id: string; user_id: string }>

    for (const row of rows) {
      const users = readBy.get(row.message_id) ?? []
      users.push(row.user_id)
      readBy.set(row.message_id, users)
    }

    return readBy
  }
}
