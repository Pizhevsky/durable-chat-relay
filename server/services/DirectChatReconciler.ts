import type Database from 'better-sqlite3'
import type {
  ChatCreatedPayload,
  ChatEvent,
  ChatId,
  NodeRole,
  UserId
} from '../../shared/types.js'
import { AppError } from '../errors.js'
import { canonicalDirectPairKey, toEvent } from './chatEventFormatters.js'
import type { EventRow } from './chatEventRows.js'

type StoreEvent = (event: ChatEvent) => void

export class DirectChatReconciler {
  constructor(
    private readonly db: Database.Database,
    private readonly nodeRole: NodeRole,
    private readonly storeEvent: StoreEvent
  ) {}

  withChatIdAlias(event: ChatEvent, chatIdAliases: Map<ChatId, ChatId>): ChatEvent {
    const canonicalChatId = chatIdAliases.get(event.chatId)
    if (!canonicalChatId) return event

    const payload = typeof event.payload === 'object' && event.payload !== null
      ? { ...event.payload, chatId: canonicalChatId }
      : event.payload

    return {
      ...event,
      chatId: canonicalChatId,
      payload
    } as ChatEvent
  }

  isDirectChatCreated(event: ChatEvent): boolean {
    return event.type === 'chat.created' && (event.payload as ChatCreatedPayload).type === 'direct'
  }

  findDuplicateCreatedEvent(event: ChatEvent): ChatEvent | null {
    if (!this.isDirectChatCreated(event)) return null

    const payload = event.payload as ChatCreatedPayload
    const memberIds = Array.from(new Set<UserId>([event.actorUserId, ...payload.memberIds]))
    if (memberIds.length !== 2) return null

    const directPairKey = canonicalDirectPairKey(memberIds)
    const existing = this.db
      .prepare('SELECT id FROM chats WHERE direct_pair_key = ?')
      .get(directPairKey) as { id: string } | undefined
    if (!existing) return null

    return this.getChatCreatedEvent(existing.id as ChatId)
  }

  shouldRemapToAuthoritative(incomingEvent: ChatEvent, existingEvent: ChatEvent): boolean {
    return this.nodeRole === 'helper' &&
      incomingEvent.type === 'chat.created' &&
      incomingEvent.syncStatus === 'central-synced' &&
      incomingEvent.chatId !== existingEvent.chatId
  }

  remapLocalDirectChat(fromChatId: ChatId, authoritativeEvent: ChatEvent): void {
    if (fromChatId === authoritativeEvent.chatId) return

    const payload = authoritativeEvent.payload as ChatCreatedPayload
    const title = payload.title?.trim() || null
    const memberIds = Array.from(new Set<UserId>([authoritativeEvent.actorUserId, ...payload.memberIds]))
    const directPairKey = canonicalDirectPairKey(memberIds)

    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO chats (id, client_chat_id, direct_pair_key, type, title, created_by, created_at, sync_status)
        VALUES (?, NULL, NULL, 'direct', ?, ?, ?, 'central-synced')
        ON CONFLICT(id) DO UPDATE SET
          title = COALESCE(excluded.title, chats.title),
          sync_status = 'central-synced'
      `).run(
        authoritativeEvent.chatId,
        title,
        authoritativeEvent.actorUserId,
        authoritativeEvent.createdAt
      )

      this.db.prepare(`
        INSERT INTO chat_members (chat_id, user_id, joined_at, left_at, is_owner)
        SELECT ?, user_id, joined_at, left_at, is_owner
        FROM chat_members
        WHERE chat_id = ?
        ON CONFLICT(chat_id, user_id) DO UPDATE SET
          left_at = excluded.left_at,
          is_owner = excluded.is_owner
      `).run(authoritativeEvent.chatId, fromChatId)

      this.db.prepare(`
        UPDATE messages
        SET chat_id = ?
        WHERE chat_id = ?
      `).run(authoritativeEvent.chatId, fromChatId)

      this.db.prepare(`
        UPDATE events
        SET chat_id = ?,
            payload_json = json_set(payload_json, '$.chatId', ?),
            sync_status = CASE WHEN type = 'chat.created' THEN 'central-synced' ELSE sync_status END
        WHERE chat_id = ?
      `).run(authoritativeEvent.chatId, authoritativeEvent.chatId, fromChatId)

      this.db.prepare('DELETE FROM chat_members WHERE chat_id = ?').run(fromChatId)
      this.db.prepare('DELETE FROM chats WHERE id = ?').run(fromChatId)
      this.db.prepare('UPDATE chats SET direct_pair_key = ? WHERE id = ?').run(directPairKey, authoritativeEvent.chatId)

      const existingAuthoritativeEvent = this.db
        .prepare('SELECT event_id FROM events WHERE event_id = ?')
        .get(authoritativeEvent.eventId)
      if (!existingAuthoritativeEvent) this.storeEvent(authoritativeEvent)
    })

    transaction()
  }

  private getChatCreatedEvent(chatId: ChatId): ChatEvent {
    const row = this.db.prepare(`
      SELECT sequence, event_id, origin_node_id, origin_device_id, actor_user_id,
             chat_id, type, payload_json, created_at, logical_clock, sync_status
      FROM events
      WHERE chat_id = ? AND type = 'chat.created'
      ORDER BY sequence ASC
      LIMIT 1
    `).get(chatId) as EventRow | undefined

    if (!row) throw new AppError('Chat creation event not found', 404, 'CHAT_CREATED_EVENT_NOT_FOUND')
    return toEvent(row)
  }
}
