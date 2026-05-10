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

  state.remapChatId(original.chatId, confirmed.chatId)
  await remapPendingChatEvents(original.chatId, confirmed.chatId)

  return {
    remappedChat: {
      fromChatId: original.chatId,
      toChatId: confirmed.chatId
    }
  }
}

function isDirectChatCreatedEvent(event: ChatEvent): event is ChatEvent<ChatCreatedPayload> {
  return event.type === 'chat.created' && (event.payload as ChatCreatedPayload).type === 'direct'
}

function directPairKeyFromEvent(event: ChatEvent<ChatCreatedPayload>): string {
  return canonicalDirectPairKey(event.actorUserId, ...event.payload.memberIds)
}
