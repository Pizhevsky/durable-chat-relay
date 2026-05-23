import {
  type ChatEvent,
  type ChatId,
  type ChatSummary,
  type DeviceId,
  type EventId,
  type Message,
  type User,
  type UserId
} from '../../../shared/types'
import { nowIso } from '../utils/dates'
import { plainRecord } from '../utils/records'
import {
  localDb,
  MAX_EVENT_RETRY_COUNT,
  type LocalEventRecord
} from './localDbSchema'
export { cleanupSyncedEvents } from './localDbCleanup'
export { exportRecoveryDump, importRecoveryDump } from './localRecovery'

export {
  localDb,
  MAX_EVENT_RETRY_COUNT,
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
    retryCount: 0,
    updatedAt: nowIso()
  })
}

export async function savePeerEvent(
  event: ChatEvent,
  peerDeviceId: DeviceId
): Promise<void> {
  const syncedByCentral = event.syncStatus === 'central-synced'
  const updatedAt = nowIso()
  await localDb.transaction('rw', localDb.events, localDb.peerAcks, async () => {
    await localDb.events.put({
      ...plainRecord(event),
      localStatus: syncedByCentral ? 'sent-to-central' : 'peer-replicated',
      syncStatus: syncedByCentral ? 'central-synced' : 'peer-replicated',
      retryCount: 0,
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

  const events = await localDb.events.bulkGet(eventIds)
  return events
    .filter((event): event is LocalEventRecord => Boolean(event))
    .sort((first, second) => first.createdAt.localeCompare(second.createdAt))
}

export async function markEventsSent(eventIds: EventId[], localStatus: LocalEventRecord['localStatus']): Promise<void> {
  await localDb.transaction('rw', localDb.events, async () => {
    for (const eventId of eventIds) {
      await localDb.events.update(eventId, {
        localStatus,
        syncStatus: localStatus === 'sent-to-central' ? 'central-synced' : 'helper-synced',
        updatedAt: nowIso(),
        retryCount: 0,
        lastError: undefined
      })
    }
  })
}

export async function markEventFailed(eventId: EventId, error: string): Promise<void> {
  const event = await localDb.events.get(eventId)
  await localDb.events.update(eventId, {
    localStatus: 'failed',
    lastError: error,
    retryCount: (event?.retryCount ?? 0) + 1,
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
  const events = await localDb.events
    .where('localStatus')
    .anyOf(['pending', 'failed', 'sent-to-helper', 'peer-replicated'])
    .sortBy('createdAt')

  return events.filter((event) => (event.retryCount ?? 0) < MAX_EVENT_RETRY_COUNT)
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

function payloadWithChatId<TPayload>(payload: TPayload, chatId: ChatId): TPayload {
  if (!payload || typeof payload !== 'object' || !('chatId' in payload)) return payload
  return { ...payload, chatId } as TPayload
}
