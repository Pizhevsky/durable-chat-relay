import type Database from 'better-sqlite3'
import type { ChatEvent, EventId } from '../../shared/types.js'
import { AppError } from '../errors.js'
import { toEvent } from './chatEventFormatters.js'
import type { EventRow } from './chatEventRows.js'

export class ChatEventStore {
  constructor(private readonly db: Database.Database) {}

  hasEvent(eventId: EventId): boolean {
    const row = this.db.prepare('SELECT event_id FROM events WHERE event_id = ?').get(eventId)
    return Boolean(row)
  }

  getById(eventId: EventId): ChatEvent {
    const row = this.db.prepare(`
      SELECT sequence, event_id, origin_node_id, origin_device_id, actor_user_id,
             chat_id, type, payload_json, created_at, logical_clock, sync_status
      FROM events WHERE event_id = ?
    `).get(eventId) as EventRow | undefined

    if (!row) throw new AppError('Event not found', 404, 'EVENT_NOT_FOUND')
    return toEvent(row)
  }

  getSince(sequence: number, limit = 1000): ChatEvent[] {
    const safeLimit = Math.max(1, Math.min(100000, Number.isFinite(limit) ? Math.floor(limit) : 1000))
    const rows = this.db.prepare(`
      SELECT sequence, event_id, origin_node_id, origin_device_id, actor_user_id,
             chat_id, type, payload_json, created_at, logical_clock, sync_status
      FROM events
      WHERE sequence > ?
      ORDER BY sequence ASC
      LIMIT ?
    `).all(sequence, safeLimit) as EventRow[]

    return rows.map((row) => toEvent(row))
  }

  getSequence(eventId: EventId): number {
    const row = this.db
      .prepare('SELECT sequence FROM events WHERE event_id = ?')
      .get(eventId) as { sequence: number } | undefined

    return row?.sequence ?? 0
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
      WHERE sync_status != 'central-synced' AND sync_status != 'conflict'
      ORDER BY sequence ASC
      LIMIT ?
    `).all(limit) as EventRow[]

    return rows.map((row) => toEvent(row))
  }

  storeEvent(event: ChatEvent): void {
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

  markCentralSynced(eventIds: EventId[]): void {
    this.markCentralSyncStatus(eventIds, 'central-synced')
  }

  markCentralConflicted(eventIds: EventId[]): void {
    this.markCentralSyncStatus(eventIds, 'conflict')
  }

  private markCentralSyncStatus(eventIds: EventId[], syncStatus: 'central-synced' | 'conflict'): void {
    if (eventIds.length === 0) return

    const updateEvent = this.db.prepare(`
      UPDATE events
      SET sync_status = ?
      WHERE event_id = ?
    `)
    const updateMessage = this.db.prepare(`
      UPDATE messages
      SET sync_status = ?
      WHERE id IN (
        SELECT json_extract(payload_json, '$.messageId')
        FROM events
        WHERE event_id = ? AND type = 'message.created'
      )
    `)
    const updateChat = this.db.prepare(`
      UPDATE chats
      SET sync_status = ?
      WHERE id IN (
        SELECT json_extract(payload_json, '$.chatId')
        FROM events
        WHERE event_id = ? AND type = 'chat.created'
      )
    `)

    const transaction = this.db.transaction(() => {
      for (const eventId of eventIds) {
        updateEvent.run(syncStatus, eventId)
        updateMessage.run(syncStatus, eventId)
        updateChat.run(syncStatus, eventId)
      }
    })

    transaction()
  }
}
