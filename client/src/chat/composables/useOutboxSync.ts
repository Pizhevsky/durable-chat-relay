import { ref } from 'vue'
import type { Ref } from 'vue'
import type { ChatEvent } from '../../../../shared/types'
import {
  cleanupSyncedEvents,
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
  publishOnline: (event: ChatEvent) => Promise<ChatEvent>
  onEventConfirmed: (
    confirmed: ChatEvent,
    original: ChatEvent
  ) => ConfirmedEventResult | void | Promise<ConfirmedEventResult | void>
  onPendingCount: (count: number) => void
}

export function useOutboxSync(input: OutboxSyncInput): OutboxSync {
  const syncing = ref(false)

  async function saveAndSend(event: ChatEvent): Promise<void> {
    await saveLocalEvent(event)
    await refreshPendingCount()

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
      const chatRemaps = new Map<string, string>()
      for (const pendingEvent of pending) {
        const event = eventWithRemappedChat(pendingEvent, chatRemaps)
        try {
          const confirmed = await input.publishOnline(event)
          const result = await input.onEventConfirmed(confirmed, event)
          if (result?.remappedChat) {
            await remapPendingChatEvents(
              result.remappedChat.fromChatId,
              result.remappedChat.toChatId
            )
            chatRemaps.set(result.remappedChat.fromChatId, result.remappedChat.toChatId)
          }
          await markConfirmedEventSent(pendingEvent.eventId, confirmed)
        } catch (error: unknown) {
          await markEventFailed(pendingEvent.eventId, errorMessage(error, 'Retry failed'))
        }
      }
    } finally {
      syncing.value = false
      await refreshPendingCount()
    }
  }

  async function refreshPendingCount(): Promise<void> {
    const pending = await pendingEvents()
    input.onPendingCount(pending.filter((event) => event.localStatus !== 'sent-to-central').length)
  }

  async function markConfirmedEventSent(originalEventId: string, confirmed: ChatEvent): Promise<void> {
    const localStatus = confirmed.syncStatus === 'central-synced' ? 'sent-to-central' : 'sent-to-helper'
    await markEventsSent([originalEventId], localStatus)
    if (localStatus === 'sent-to-central') await cleanupSyncedEvents()
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
