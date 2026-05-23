import type { ChatEvent } from './events.js'
import type { DeviceId, EventId, NodeId, NodeRole } from './ids.js'

export interface SyncRequest {
  sourceNodeId: NodeId
  sourceDeviceId?: DeviceId
  events: ChatEvent[]
}

export type SyncConflictEntry = EventId | SyncConflict

export interface SyncResponse {
  accepted: EventId[]
  duplicates: EventId[]
  conflicts: SyncConflictEntry[]
  serverEvents: ChatEvent[]
  nodeRole?: NodeRole
  nodeId?: NodeId
  centralNodeId?: NodeId
  dryRun?: boolean
}

export interface SyncConflict {
  eventId: EventId
  code?: string
  message?: string
  status?: number
  category?: string
  retryable?: boolean
}

export interface SyncPullResponse {
  nodeRole?: NodeRole
  nodeId?: NodeId
  centralNodeId?: NodeId
  latestSequence: number
  currentSequence?: number
  hasMore?: boolean
  events: ChatEvent[]
}
