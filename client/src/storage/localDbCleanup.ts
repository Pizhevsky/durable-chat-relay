import type { EventId } from '../../../shared/types'
import {
  localDb,
  SYNCED_EVENT_MIN_KEEP,
  SYNCED_EVENT_RETENTION_MS,
  type LocalEventRecord,
  type SyncCleanupOptions,
  type SyncCleanupResult
} from './localDbSchema'

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
    const staleEventIds = eventIdsEligibleForCleanup(syncedEvents, keepMostRecent, cutoffIso)

    if (staleEventIds.length > 0) {
      await localDb.events.bulkDelete(staleEventIds)
      deletedEvents = staleEventIds.length
    }

    const remainingEventIds = new Set((await localDb.events.toArray()).map((event) => event.eventId))
    const orphanAcks = (await localDb.peerAcks.toArray())
      .filter((ack) => !remainingEventIds.has(ack.eventId))
    if (orphanAcks.length > 0) {
      await localDb.peerAcks.bulkDelete(orphanAcks.map((ack) => [ack.eventId, ack.peerDeviceId]))
      deletedPeerAcks = orphanAcks.length
    }
  })

  return { deletedEvents, deletedPeerAcks }
}

function eventIdsEligibleForCleanup(
  events: LocalEventRecord[],
  keepMostRecent: number,
  cutoffIso: string
): EventId[] {
  const retainedEventIds = new Set(
    [...events]
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
      .slice(0, Math.max(0, keepMostRecent))
      .map((event) => event.eventId)
  )

  return events
    .filter((event) => !retainedEventIds.has(event.eventId) && event.updatedAt < cutoffIso)
    .map((event) => event.eventId)
}
