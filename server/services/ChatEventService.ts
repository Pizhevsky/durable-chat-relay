import type Database from 'better-sqlite3'
import type {
  ChatCreatedPayload,
  ChatEvent,
  ChatId,
  EventId,
  NodeRole,
  UserId
} from '../../shared/types.js'
import { AppError } from '../errors.js'
import { ChatEventProjector } from './ChatEventProjector.js'
import { ChatReadModel } from './ChatReadModel.js'
import {
  canonicalDirectPairKey,
  normaliseIncomingStatus,
  toEvent
} from './chatEventFormatters.js'
import type { EventRow } from './chatEventRows.js'

export class ChatEventService {
  private readonly projector: ChatEventProjector
  private readonly readModel: ChatReadModel

  constructor(
    private readonly db: Database.Database,
    private readonly nodeRole: NodeRole
  ) {
    this.projector = new ChatEventProjector(db)
    this.readModel = new ChatReadModel(db)
  }

  listUsers() {
    return this.readModel.listUsers()
  }

  listChats(userId: UserId) {
    return this.readModel.listChats(userId)
  }

  listMessages(chatId: ChatId, userId: UserId) {
    return this.readModel.listMessages(chatId, userId)
  }

  getActiveMemberIds(chatId: ChatId): UserId[] {
    return this.readModel.getActiveMemberIds(chatId)
  }

  usersShareActiveChat(firstUserId: UserId, secondUserId: UserId): boolean {
    return this.readModel.usersShareActiveChat(firstUserId, secondUserId)
  }

  applyEvent(event: ChatEvent): { event: ChatEvent; inserted: boolean } {
    const existing = this.db.prepare('SELECT event_id FROM events WHERE event_id = ?').get(event.eventId)
    if (existing) {
      return { event: this.getEventById(event.eventId), inserted: false }
    }

    const syncStatus = this.nodeRole === 'central'
      ? 'central-synced'
      : normaliseIncomingStatus(event.syncStatus, this.nodeRole)
    const eventToStore: ChatEvent = { ...event, syncStatus }
    const existingDirectChatEvent = this.findExistingDirectChatCreatedEvent(eventToStore)
    if (existingDirectChatEvent) {
      return { event: existingDirectChatEvent, inserted: false }
    }

    const transaction = this.db.transaction(() => {
      this.storeEvent(eventToStore)
      this.projector.projectEvent(eventToStore)
    })

    transaction()
    return { event: eventToStore, inserted: true }
  }

  applyEvents(events: ChatEvent[]): {
    accepted: EventId[]
    duplicates: EventId[]
    conflicts: EventId[]
    serverEvents: ChatEvent[]
  } {
    const accepted: EventId[] = []
    const duplicates: EventId[] = []
    const conflicts: EventId[] = []
    const serverEvents: ChatEvent[] = []

    for (const event of events) {
      try {
        const result = this.applyEvent(event)
        serverEvents.push(result.event)
        if (result.inserted) accepted.push(event.eventId)
        else duplicates.push(event.eventId)
      } catch (_error) {
        conflicts.push(event.eventId)
      }
    }

    return { accepted, duplicates, conflicts, serverEvents }
  }

  getEventsSince(sequence: number): ChatEvent[] {
    const rows = this.db.prepare(`
      SELECT sequence, event_id, origin_node_id, origin_device_id, actor_user_id,
             chat_id, type, payload_json, created_at, logical_clock, sync_status
      FROM events
      WHERE sequence > ?
      ORDER BY sequence ASC
    `).all(sequence) as EventRow[]

    return rows.map((row) => toEvent(row))
  }

  getCurrentSequence(): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM events')
      .get() as { sequence: number }
    return row.sequence
  }

  getPendingCentralSync(limit = 100): ChatEvent[] {
    const rows = this.db.prepare(`
      SELECT sequence, event_id, origin_node_id, origin_device_id, actor_user_id,
             chat_id, type, payload_json, created_at, logical_clock, sync_status
      FROM events
      WHERE sync_status != 'central-synced'
      ORDER BY sequence ASC
      LIMIT ?
    `).all(limit) as EventRow[]

    return rows.map((row) => toEvent(row))
  }

  markCentralSynced(eventIds: EventId[]): void {
    if (eventIds.length === 0) return

    const updateEvent = this.db.prepare(`
      UPDATE events
      SET sync_status = 'central-synced'
      WHERE event_id = ?
    `)
    const updateMessage = this.db.prepare(`
      UPDATE messages
      SET sync_status = 'central-synced'
      WHERE id IN (
        SELECT json_extract(payload_json, '$.messageId')
        FROM events
        WHERE event_id = ? AND type = 'message.created'
      )
    `)
    const updateChat = this.db.prepare(`
      UPDATE chats
      SET sync_status = 'central-synced'
      WHERE id IN (
        SELECT json_extract(payload_json, '$.chatId')
        FROM events
        WHERE event_id = ? AND type = 'chat.created'
      )
    `)

    const transaction = this.db.transaction(() => {
      for (const eventId of eventIds) {
        updateEvent.run(eventId)
        updateMessage.run(eventId)
        updateChat.run(eventId)
      }
    })

    transaction()
  }

  getSyncCursor(key: string): number {
    const row = this.db
      .prepare('SELECT value FROM node_sync_state WHERE key = ?')
      .get(key) as { value: string } | undefined
    return row ? Number(row.value) : 0
  }

  setSyncCursor(key: string, value: number): void {
    this.db.prepare(`
      INSERT INTO node_sync_state (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value))
  }

  exportEvents(): ChatEvent[] {
    return this.getEventsSince(0)
  }

  private storeEvent(event: ChatEvent): void {
    this.db.prepare(`
      INSERT INTO events (
        event_id, origin_node_id, origin_device_id, actor_user_id, chat_id,
        type, payload_json, created_at, logical_clock, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.eventId,
      event.originNodeId,
      event.originDeviceId,
      event.actorUserId,
      event.chatId,
      event.type,
      JSON.stringify(event.payload),
      event.createdAt,
      event.logicalClock,
      event.syncStatus
    )
  }

  private findExistingDirectChatCreatedEvent(event: ChatEvent): ChatEvent | null {
    if (event.type !== 'chat.created') return null

    const payload = event.payload as ChatCreatedPayload
    if (payload.type !== 'direct') return null

    const memberIds = Array.from(new Set([event.actorUserId, ...payload.memberIds]))
    if (memberIds.length !== 2) return null

    const directPairKey = canonicalDirectPairKey(memberIds)
    const existing = this.db
      .prepare('SELECT id FROM chats WHERE direct_pair_key = ?')
      .get(directPairKey) as { id: string } | undefined
    if (!existing) return null

    return this.getChatCreatedEvent(existing.id)
  }

  private getEventById(eventId: EventId): ChatEvent {
    const row = this.db.prepare(`
      SELECT sequence, event_id, origin_node_id, origin_device_id, actor_user_id,
             chat_id, type, payload_json, created_at, logical_clock, sync_status
      FROM events WHERE event_id = ?
    `).get(eventId) as EventRow | undefined

    if (!row) throw new AppError('Event not found', 404, 'EVENT_NOT_FOUND')
    return toEvent(row)
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
