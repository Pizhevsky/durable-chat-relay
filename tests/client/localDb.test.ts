import 'fake-indexeddb/auto'
import { reactive } from 'vue'
import { describe, expect, it, beforeEach } from 'vitest'
import {
  cacheChats,
  cachedChats,
  cleanupSyncedEvents,
  exportRecoveryDump,
  localDb,
  markEventFailed,
  MAX_EVENT_RETRY_COUNT,
  markEventsSent,
  pendingEvents,
  recordPeerAck,
  savePeerEvent,
  saveLocalEvent
} from '../../client/src/storage/localDb'
import { RECOVERY_DUMP_FORMAT } from '../../shared/types'
import type { ChatSummary } from '../../shared/types'
import { messageCreatedEvent } from '../helpers/chatEvents'

describe('local IndexedDB outbox', () => {
  beforeEach(async () => {
    await localDb.delete()
    await localDb.open()
  })

  it('stores pending events before network delivery', async () => {
    const item = messageCreatedEvent()
    await saveLocalEvent(item)

    const pending = await pendingEvents()
    expect(pending.map((row) => row.eventId)).toContain(item.eventId)
  })

  it('removes central-confirmed events from retry candidates', async () => {
    const item = messageCreatedEvent()
    await saveLocalEvent(item)
    await markEventsSent([item.eventId], 'sent-to-central')

    expect(await pendingEvents()).toHaveLength(0)
  })

  it('keeps helper-confirmed and failed events retryable until central sync', async () => {
    const helperItem = messageCreatedEvent({ eventId: 'browser-test:helper' })
    const failedItem = messageCreatedEvent({ eventId: 'browser-test:failed' })
    await saveLocalEvent(helperItem)
    await saveLocalEvent(failedItem)

    await markEventsSent([helperItem.eventId], 'sent-to-helper')
    await markEventFailed(failedItem.eventId, 'network down')

    const pending = await pendingEvents()
    expect(pending.map((row) => row.eventId).sort()).toEqual([failedItem.eventId, helperItem.eventId].sort())
  })

  it('stops returning failed events after the retry cap', async () => {
    const failedItem = messageCreatedEvent({ eventId: 'browser-test:permanent-failure' })
    await saveLocalEvent(failedItem)

    for (let retry = 0; retry < MAX_EVENT_RETRY_COUNT; retry += 1) {
      await markEventFailed(failedItem.eventId, 'still invalid')
    }

    expect(await pendingEvents()).toHaveLength(0)
  })

  it('keeps peer-replicated events retryable until central sync', async () => {
    const item = messageCreatedEvent({ eventId: 'browser-test:peer' })
    await savePeerEvent(item, 'peer-device')

    const pending = await pendingEvents()
    expect(pending.map((row) => row.eventId)).toEqual([item.eventId])
    expect(pending[0].localStatus).toBe('peer-replicated')
  })

  it('exports a recovery dump with local events', async () => {
    await saveLocalEvent(messageCreatedEvent())
    const dump = await exportRecoveryDump('u-denis', 'browser-test')

    expect(dump.format).toBe(RECOVERY_DUMP_FORMAT)
    expect(dump.events).toHaveLength(1)
    expect(dump.checksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it('caches chat summaries for browser-only reopening', async () => {
    const chats: ChatSummary[] = [{
      id: 'chat-test',
      type: 'direct',
      title: 'Anna',
      createdBy: 'u-denis',
      createdAt: new Date().toISOString(),
      members: [],
      unreadCount: 0,
      syncStatus: 'central-synced'
    }]

    await cacheChats('u-denis', chats)
    expect(await cachedChats('u-denis')).toEqual(chats)
  })

  it('caches reactive chat summaries as plain IndexedDB records', async () => {
    const chats = reactive<ChatSummary[]>([{
      id: 'chat-reactive',
      type: 'direct',
      title: 'Anna',
      createdBy: 'u-denis',
      createdAt: new Date().toISOString(),
      members: [{
        userId: 'u-denis',
        name: 'Denis',
        joinedAt: new Date().toISOString(),
        leftAt: null,
        isOwner: true
      }],
      unreadCount: 0,
      syncStatus: 'local'
    }])

    await cacheChats('u-denis', chats)
    expect(await cachedChats('u-denis')).toEqual(JSON.parse(JSON.stringify(chats)))
  })

  it('prunes only stale central-synced events and orphan peer ACKs', async () => {
    const oldSynced = messageCreatedEvent({ eventId: 'browser-test:old-synced' })
    const recentSynced = messageCreatedEvent({ eventId: 'browser-test:recent-synced' })
    const retryable = messageCreatedEvent({ eventId: 'browser-test:retryable' })
    await saveLocalEvent(oldSynced)
    await saveLocalEvent(recentSynced)
    await saveLocalEvent(retryable)
    await markEventsSent([oldSynced.eventId, recentSynced.eventId], 'sent-to-central')
    await recordPeerAck(oldSynced.eventId, 'peer-old')
    await recordPeerAck(recentSynced.eventId, 'peer-recent')
    await recordPeerAck('browser-test:missing-event', 'peer-orphan')

    await localDb.events.update(oldSynced.eventId, { updatedAt: '2026-01-01T00:00:00.000Z' })
    await localDb.events.update(recentSynced.eventId, { updatedAt: '2026-01-03T00:00:00.000Z' })

    const result = await cleanupSyncedEvents({
      retentionMs: 24 * 60 * 60 * 1000,
      keepMostRecent: 1,
      nowMs: Date.parse('2026-01-03T12:00:00.000Z')
    })

    expect(result).toEqual({ deletedEvents: 1, deletedPeerAcks: 2 })
    expect(await localDb.events.get(oldSynced.eventId)).toBeUndefined()
    expect(await localDb.events.get(recentSynced.eventId)).toBeTruthy()
    expect(await localDb.events.get(retryable.eventId)).toBeTruthy()
    expect(await localDb.peerAcks.toArray()).toEqual([
      expect.objectContaining({ eventId: recentSynced.eventId, peerDeviceId: 'peer-recent' })
    ])
  })
})
