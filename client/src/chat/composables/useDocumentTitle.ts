import { watch } from 'vue'
import type { ChatState } from './useChatState'

export function useDocumentTitle(state: ChatState) {
  const baseTitle = document.title || 'Durable Chat Relay'

  function updateDocumentTitle(): void {
    const selectedUser = state.users.value.find((user) => user.id === state.currentUserId.value)
    const userLabel = selectedUser?.name ?? state.currentUserId.value
    document.title = `${userLabel} - ${baseTitle}`
  }

  watch(
    [() => state.currentUserId.value, () => state.users.value],
    updateDocumentTitle,
    { immediate: true }
  )
}
