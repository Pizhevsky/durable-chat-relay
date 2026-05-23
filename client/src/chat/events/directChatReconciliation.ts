import type { ChatCreatedPayload, ChatEvent } from '../../../../shared/types'
import { remapPendingChatEvents } from '../../storage/localDb'
import { canonicalDirectPairKey } from '../../utils/chatIdentity'
import type { ChatState } from '../composables/useChatState'

export interface DirectChatReconciliationResult {
  remappedChat?: {
    fromChatId: string
    toChatId: string
  }
}

export async function reconcileDirectChatConfirmation(
  state: ChatState,
  confirmed: ChatEvent,
  original: ChatEvent
): Promise<DirectChatReconciliationResult | undefined> {
  if (!isDirectChatCreatedEvent(confirmed) || !isDirectChatCreatedEvent(original)) return undefined
  if (confirmed.chatId === original.chatId) return undefined
  if (directPairKeyFromEvent(confirmed) !== directPairKeyFromEvent(original)) return undefined

  return remapDirectChat(state, original.chatId, confirmed.chatId)
}

export async function reconcileDirectChatFromCentralEvent(
  state: ChatState,
  confirmed: ChatEvent
): Promise<DirectChatReconciliationResult | undefined> {
  if (!isDirectChatCreatedEvent(confirmed)) return undefined
  if (confirmed.syncStatus !== 'central-synced') return undefined

  const directPairKey = directPairKeyFromEvent(confirmed)
  const existing = state.chats.value.find((chat) =>
    chat.type === 'direct' &&
    chat.directPairKey === directPairKey &&
    chat.id !== confirmed.chatId
  )
  if (!existing) return undefined

  return remapDirectChat(state, existing.id, confirmed.chatId)
}

async function remapDirectChat(
  state: ChatState,
  fromChatId: string,
  toChatId: string
): Promise<DirectChatReconciliationResult | undefined> {
  if (fromChatId === toChatId) return undefined

  state.remapChatId(fromChatId, toChatId)
  await remapPendingChatEvents(fromChatId, toChatId)

  return {
    remappedChat: {
      fromChatId,
      toChatId
    }
  }
}

function isDirectChatCreatedEvent(event: ChatEvent): event is ChatEvent<ChatCreatedPayload> {
  return event.type === 'chat.created' && (event.payload as ChatCreatedPayload).type === 'direct'
}

function directPairKeyFromEvent(event: ChatEvent<ChatCreatedPayload>): string {
  return canonicalDirectPairKey(event.actorUserId, ...event.payload.memberIds)
}
