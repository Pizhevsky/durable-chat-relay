import type {
  ChatEvent,
  ChatId,
  ChatSummary,
  DeviceId,
  EventId,
  Message,
  RecoveryDump,
  User,
  UserId
} from '../../../shared/types'
import { nowIso } from '../utils/dates'
import { plainRecord } from '../utils/records'
import {
  localDb,
  SYNCED_EVENT_MIN_KEEP,
  SYNCED_EVENT_RETENTION_MS,
  type LocalEventRecord,
  type SyncCleanupOptions,
  type SyncCleanupResult
} from './localDbSchema'

export {
  localDb,
  SYNCED_EVENT_MIN_KEEP,
  SYNCED_EVENT_RETENTION_MS,
  type LocalEventRecord,
  type SyncCleanupOptions,
  type SyncCleanupResult
} from './localDbSchema'

export async function saveLocalEvent(event: ChatEvent): Promise<void> {
  await localDb.events.put({
    ...plainRecord(event),
    localStatus: 'pending',
    updatedAt: nowIso()
  })
}

export async function savePeerEvent(event: ChatEvent, peerDeviceId: DeviceId): Promise<void> {
  const syncedByCentral = event.syncStatus === 'central-synced'
  const updatedAt = nowIso()
  await localDb.transaction('rw', localDb.events, localDb.peerAcks, async () => {
    await localDb.events.put({
      ...plainRecord(event),
      localStatus: syncedByCentral ? 'sent-to-central' : 'peer-replicated',
      syncStatus: syncedByCentral ? 'central-synced' : 'peer-replicated',
      updatedAt
    })
    await localDb.peerAcks.put({
      eventId: event.eventId,
      peerDeviceId,
      acknowledgedAt: updatedAt
    })
  })
}

export async function recordPeerAck(eventId: EventId, peerDeviceId: DeviceId): Promise<void> {
  await localDb.peerAcks.put({
    eventId,
    peerDeviceId,
    acknowledgedAt: nowIso()
  })
}

export async function peerSyncEvents(): Promise<LocalEventRecord[]> {
  return localDb.events.orderBy('createdAt').toArray()
}

export async function peerSyncEventsById(eventIds: EventId[]): Promise<LocalEventRecord[]> {
  if (eventIds.length === 0) return []

  const eventIdSet = new Set(eventIds)
  const events = await localDb.events.bulkGet(eventIds)
  return events
    .filter((event): event is LocalEventRecord => Boolean(event))
    .sort((first, second) => first.createdAt.localeCompare(second.createdAt))
    .filter((event) => eventIdSet.has(event.eventId))
}

export async function cleanupSyncedEvents(options: SyncCleanupOptions = {}): Promise<SyncCleanupResult> {
  const retentionMs = options.retentionMs ?? SYNCED_EVENT_RETENTION_MS
  const keepMostRecent = options.keepMostRecent ?? SYNCED_EVENT_MIN_KEEP
  const cutoffTime = options.nowMs ?? Date.now()
  const cutoffIso = new Date(cutoffTime - retentionMs).toISOString()

  let deletedEvents = 0
  let deletedPeerAcks = 0

  await localDb.transaction('rw', localDb.events, localDb.peerAcks, async () => {
    const syncedEvents = await localDb.events
      .where('localStatus')
      .equals('sent-to-central')
      .toArray()
    const retainedEventIds = new Set(
      syncedEvents
        .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
        .slice(0, Math.max(0, keepMostRecent))
        .map((event) => event.eventId)
    )
    const staleEventIds = syncedEvents
      .filter((event) => !retainedEventIds.has(event.eventId) && event.updatedAt < cutoffIso)
      .map((event) => event.eventId)

    if (staleEventIds.length > 0) {
      await localDb.events.bulkDelete(staleEventIds)
      deletedEvents = staleEventIds.length
    }

    const remainingEventIds = new Set((await localDb.events.toArray()).map((event) => event.eventId))
    const peerAcks = await localDb.peerAcks.toArray()
    const orphanAcks = peerAcks.filter((ack) => !remainingEventIds.has(ack.eventId))
    if (orphanAcks.length > 0) {
      await localDb.peerAcks.bulkDelete(orphanAcks.map((ack) => [ack.eventId, ack.peerDeviceId]))
      deletedPeerAcks = orphanAcks.length
    }
  })

  return { deletedEvents, deletedPeerAcks }
}

export async function markEventsSent(eventIds: EventId[], localStatus: LocalEventRecord['localStatus']): Promise<void> {
  await localDb.transaction('rw', localDb.events, async () => {
    for (const eventId of eventIds) {
      await localDb.events.update(eventId, {
        localStatus,
        syncStatus: localStatus === 'sent-to-central' ? 'central-synced' : 'helper-synced',
        updatedAt: nowIso(),
        lastError: undefined
      })
    }
  })
}

export async function markEventFailed(eventId: EventId, error: string): Promise<void> {
  await localDb.events.update(eventId, {
    localStatus: 'failed',
    lastError: error,
    updatedAt: nowIso()
  })
}

export async function remapPendingChatEvents(fromChatId: ChatId, toChatId: ChatId): Promise<void> {
  if (fromChatId === toChatId) return

  const events = await localDb.events.where('chatId').equals(fromChatId).toArray()
  const updatedAt = nowIso()
  await localDb.events.bulkPut(events.map((event) => ({
    ...event,
    chatId: toChatId,
    payload: payloadWithChatId(event.payload, toChatId),
    updatedAt
  })))
}

export async function pendingEvents(): Promise<LocalEventRecord[]> {
  return localDb.events
    .where('localStatus')
    .anyOf(['pending', 'failed', 'sent-to-helper', 'peer-replicated'])
    .sortBy('createdAt')
}

export async function cacheUsers(users: User[]): Promise<void> {
  const cachedAt = nowIso()
  await localDb.users.bulkPut(users.map((user) => ({ ...plainRecord(user), cachedAt })))
}

export async function cachedUsers(): Promise<User[]> {
  return localDb.users.orderBy('name').toArray()
}

export async function cacheChats(userId: UserId, chats: ChatSummary[]): Promise<void> {
  const cachedAt = nowIso()
  const records = chats.map((chat) => ({ ...plainRecord(chat), cachedForUserId: userId, cachedAt }))
  await localDb.transaction('rw', localDb.chats, async () => {
    await localDb.chats.where('cachedForUserId').equals(userId).delete()
    await localDb.chats.bulkPut(records)
  })
}

export async function cachedChats(userId: UserId): Promise<ChatSummary[]> {
  const rows = await localDb.chats.where('cachedForUserId').equals(userId).sortBy('createdAt')
  return rows.reverse().map(({ cachedForUserId: _cachedForUserId, cachedAt: _cachedAt, ...chat }) => chat)
}

export async function cacheMessages(chatId: string, messages: Message[]): Promise<void> {
  const cachedAt = nowIso()
  await localDb.transaction('rw', localDb.messages, async () => {
    await localDb.messages.where('chatId').equals(chatId).delete()
    await localDb.messages.bulkPut(messages.map((message) => ({ ...plainRecord(message), cachedAt })))
  })
}

export async function cachedMessages(chatId: string): Promise<Message[]> {
  const rows = await localDb.messages.where('chatId').equals(chatId).sortBy('createdAt')
  return rows.map(({ cachedAt: _cachedAt, ...message }) => message)
}

export async function exportRecoveryDump(userId: UserId, deviceId: string): Promise<RecoveryDump> {
  const events = await localDb.events.orderBy('createdAt').toArray()
  return {
    format: 'resilient-field-chat-recovery-v1',
    exportedAt: nowIso(),
    exportedBy: userId,
    deviceId,
    events,
    note: 'Browser IndexedDB recovery dump. Import it into a helper or central node if automatic sync is not possible.'
  }
}

export async function importRecoveryDump(dump: RecoveryDump): Promise<void> {
  if (dump.format !== 'resilient-field-chat-recovery-v1') {
    throw new Error('Unsupported recovery dump format')
  }

  await localDb.events.bulkPut(dump.events.map((event) => ({
    ...plainRecord(event),
    localStatus: event.syncStatus === 'central-synced' ? 'sent-to-central' : 'pending',
    updatedAt: nowIso()
  })))
}

function payloadWithChatId<TPayload>(payload: TPayload, chatId: ChatId): TPayload {
  if (!payload || typeof payload !== 'object' || !('chatId' in payload)) return payload
  return { ...payload, chatId } as TPayload
}
