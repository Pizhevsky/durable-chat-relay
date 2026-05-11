import { ref } from 'vue'
import type { Ref } from 'vue'
import type { ChatEvent, SyncResponse } from '../../../../shared/types'
import {
  cleanupSyncedEvents,
  type LocalEventRecord,
  markEventFailed,
  markEventsSent,
  pendingEvents,
  remapPendingChatEvents,
  saveLocalEvent
} from '../../storage/localDb'
import { errorMessage } from '../errorMessage'

interface ConfirmedEventResult {
  remappedChat?: {
    fromChatId: string
    toChatId: string
  }
}

export interface OutboxSync {
  syncing: Ref<boolean>
  saveAndSend: (event: ChatEvent) => Promise<void>
  retryPending: () => Promise<void>
  refreshPendingCount: () => Promise<void>
}

interface OutboxSyncInput {
  getUserId: () => string
  publishOnline: (event: ChatEvent) => Promise<ChatEvent>
  syncReplicated: (events: ChatEvent[]) => Promise<SyncResponse>
  onEventConfirmed: (
    confirmed: ChatEvent,
    original: ChatEvent
  ) => ConfirmedEventResult | void | Promise<ConfirmedEventResult | void>
  onPendingCount: (count: number) => void
  onEventSaved?: (event: ChatEvent) => void | Promise<void>
}

export function useOutboxSync(input: OutboxSyncInput): OutboxSync {
  const syncing = ref(false)

  async function saveAndSend(event: ChatEvent): Promise<void> {
    await saveLocalEvent(event)
    await refreshPendingCount()
    await input.onEventSaved?.(event)

    try {
      const confirmed = await input.publishOnline(event)
      await input.onEventConfirmed(confirmed, event)
      await markConfirmedEventSent(event.eventId, confirmed)
    } catch (error: unknown) {
      await markEventFailed(event.eventId, errorMessage(error, 'Unknown send failure'))
    }

    await refreshPendingCount()
  }

  async function retryPending(): Promise<void> {
    if (syncing.value) return
    syncing.value = true

    try {
      const pending = await pendingEvents()
      await retryOwnEvents(ownPendingEvents(pending))
      await syncReplicatedEvents(peerReplicatedEvents(pending))
    } finally {
      syncing.value = false
      await refreshPendingCount()
    }
  }

  async function refreshPendingCount(): Promise<void> {
    const pending = await pendingEvents()
    input.onPendingCount(pending.filter((event) =>
      event.actorUserId === input.getUserId() &&
      event.localStatus !== 'sent-to-central'
    ).length)
  }

  async function markConfirmedEventSent(originalEventId: string, confirmed: ChatEvent): Promise<void> {
    const localStatus = confirmed.syncStatus === 'central-synced' ? 'sent-to-central' : 'sent-to-helper'
    await markEventsSent([originalEventId], localStatus)
    if (localStatus === 'sent-to-central') await cleanupSyncedEvents()
  }

  async function retryOwnEvents(events: ChatEvent[]): Promise<void> {
    const chatRemaps = new Map<string, string>()

    for (const pendingEvent of events) {
      await retryOwnEvent(pendingEvent, chatRemaps)
    }
  }

  async function retryOwnEvent(event: ChatEvent, chatRemaps: Map<string, string>): Promise<void> {
    const eventToPublish = eventWithRemappedChat(event, chatRemaps)

    try {
      const confirmed = await input.publishOnline(eventToPublish)
      const result = await input.onEventConfirmed(confirmed, eventToPublish)
      if (result?.remappedChat) {
        await remapPendingChatEvents(
          result.remappedChat.fromChatId,
          result.remappedChat.toChatId
        )
        chatRemaps.set(result.remappedChat.fromChatId, result.remappedChat.toChatId)
      }
      await markConfirmedEventSent(event.eventId, confirmed)
    } catch (error: unknown) {
      await markEventFailed(event.eventId, errorMessage(error, 'Retry failed'))
    }
  }

  async function syncReplicatedEvents(events: ChatEvent[]): Promise<void> {
    if (events.length === 0) return

    try {
      const result = await input.syncReplicated(events)
      const syncedEventIds = [...result.accepted, ...result.duplicates]
      if (syncedEventIds.length > 0) {
        await markEventsSent(syncedEventIds, 'sent-to-central')
        await cleanupSyncedEvents()
      }

      for (const eventId of result.conflicts) {
        await markEventFailed(eventId, 'Peer-replicated event was rejected by central sync')
      }
    } catch (error: unknown) {
      for (const event of events) {
        await markEventFailed(event.eventId, errorMessage(error, 'Peer sync failed'))
      }
    }
  }

  function ownPendingEvents(events: LocalEventRecord[]): LocalEventRecord[] {
    return events.filter((event) => event.actorUserId === input.getUserId())
  }

  function peerReplicatedEvents(events: LocalEventRecord[]): LocalEventRecord[] {
    return events.filter((event) =>
      event.actorUserId !== input.getUserId() &&
      (event.localStatus === 'peer-replicated' || event.localStatus === 'sent-to-helper')
    )
  }

  return {
    syncing,
    saveAndSend,
    retryPending,
    refreshPendingCount
  }
}

function eventWithRemappedChat(event: ChatEvent, chatRemaps: Map<string, string>): ChatEvent {
  const toChatId = chatRemaps.get(event.chatId)
  if (!toChatId) return event

  return {
    ...event,
    chatId: toChatId,
    payload: event.payload && typeof event.payload === 'object' && 'chatId' in event.payload
      ? { ...event.payload, chatId: toChatId }
      : event.payload
  }
}
