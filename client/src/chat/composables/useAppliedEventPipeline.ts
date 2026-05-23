import type { ChatEvent } from '../../../../shared/types'
import { errorMessage } from '../errorMessage'
import { reconcileDirectChatFromCentralEvent } from '../events/directChatReconciliation'
import type { ChatState } from './useChatState'

type AppliedChatEvent = Parameters<ChatState['applyEvent']>[0]

interface AppliedEventPipelineInput {
  state: ChatState
  publishLocalEvent: (event: ChatEvent) => void
  publishPeerEvent: (event: AppliedChatEvent) => void
  notifyFromForeground: (message: NonNullable<ReturnType<ChatState['applyEvent']>['message']>, currentUserId: string) => void
  persistVisibleState: (chatId?: string | null) => Promise<void>
  refreshChats: () => Promise<void>
  markActiveMessagesRead: () => Promise<void>
  syncPeerTargets: () => void
}

export function useAppliedEventPipeline(input: AppliedEventPipelineInput) {
  const { state } = input

  async function handleAppliedEvent(
    event: AppliedChatEvent,
    options: { rebroadcast: boolean }
  ): Promise<void> {
    await reconcileDirectChatFromCentralEvent(state, event)
    const result = state.applyEvent(event)
    if (event.type === 'chat.created' || event.type === 'member.added' || event.type === 'member.removed') {
      input.syncPeerTargets()
    }
    if (options.rebroadcast) {
      input.publishLocalEvent(event)
      input.publishPeerEvent(event)
    }
    if (result.message && event.actorUserId !== state.currentUserId.value) {
      input.notifyFromForeground(result.message, state.currentUserId.value)
    }
    await input.persistVisibleState(event.chatId)
    if (result.needsRefresh) await input.refreshChats()
    if (event.chatId === state.activeChatId.value) {
      input.markActiveMessagesRead().catch((error: unknown) => {
        state.lastError.value = errorMessage(error, 'Failed to mark messages as read')
      })
    }
  }

  return {
    handleAppliedEvent
  }
}
