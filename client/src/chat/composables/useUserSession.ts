import type { ChatId, UserId } from '../../../../shared/types'
import type { ChatBrowserActions } from '../actions/chatBrowser'
import type { ChatActions } from '../actions/chatActions'
import type { ChatState } from './useChatState'
import type { usePeerReplication } from './usePeerReplication'

interface UserSessionInput {
  state: ChatState
  browserActions: ChatBrowserActions
  peerReplication: () => ReturnType<typeof usePeerReplication> | null
  reconnectUser: () => void
  refreshChats: () => Promise<void>
  loadActiveMessages: () => Promise<void>
  syncPeerTargets: () => void
  actions: () => ChatActions
}

export function useUserSession(input: UserSessionInput) {
  const { state } = input

  async function openChat(chatId: ChatId): Promise<void> {
    state.activeChatId.value = chatId
    input.browserActions.updateChatQueryParam(chatId)
    await input.loadActiveMessages()
    await input.actions().markActiveMessagesRead()
  }

  async function changeUser(userId: UserId): Promise<void> {
    if (state.currentUserId.value === userId) return

    input.peerReplication()?.resetForUserChange()
    state.setCurrentUser(userId)
    input.browserActions.syncUserIdentity(userId)
    input.reconnectUser()
    await input.refreshChats()
    input.syncPeerTargets()
    await input.loadActiveMessages()
    await input.actions().markActiveMessagesRead()
  }

  return {
    openChat,
    changeUser
  }
}
