import Dexie, { type Table } from 'dexie'
import type {
  ChatEvent,
  ChatSummary,
  DeviceId,
  EventId,
  Message,
  PeerAck,
  User,
  UserId
} from '../../../shared/types'
import { clientConfig } from '../config/clientConfig'

export interface LocalEventRecord extends ChatEvent {
  localStatus: 'pending' | 'sent-to-helper' | 'sent-to-central' | 'peer-replicated' | 'failed'
  lastError?: string
  retryCount?: number
  updatedAt: string
}

export interface CachedChatRecord extends ChatSummary {
  cachedForUserId: UserId
  cachedAt: string
}

export interface CachedMessageRecord extends Message {
  cachedAt: string
}

export interface CachedUserRecord extends User {
  cachedAt: string
}

export interface SyncCleanupResult {
  deletedEvents: number
  deletedPeerAcks: number
}

export interface SyncCleanupOptions {
  retentionMs?: number
  keepMostRecent?: number
  nowMs?: number
}

export const SYNCED_EVENT_RETENTION_MS = clientConfig.syncedEventRetentionMs
export const SYNCED_EVENT_MIN_KEEP = clientConfig.syncedEventMinKeep
export const MAX_EVENT_RETRY_COUNT = clientConfig.maxEventRetryCount

export class ChatLocalDb extends Dexie {
  events!: Table<LocalEventRecord, EventId>
  peerAcks!: Table<PeerAck, [EventId, DeviceId]>
  users!: Table<CachedUserRecord, UserId>
  chats!: Table<CachedChatRecord, [UserId, string]>
  messages!: Table<CachedMessageRecord, string>

  constructor() {
    super(clientConfig.localDbName)
    this.version(1).stores({
      events: 'eventId, chatId, actorUserId, syncStatus, localStatus, createdAt, updatedAt',
      peerAcks: '[eventId+peerDeviceId], eventId, peerDeviceId',
      users: 'id, name',
      chats: '[cachedForUserId+id], cachedForUserId, id, createdAt, cachedAt',
      messages: 'id, chatId, createdAt, cachedAt'
    })
  }
}

export const localDb = new ChatLocalDb()
