import type { AppConfig } from '../../../../shared/types'
import { api } from '../../services/api'
import {
  cacheChats,
  cacheMessages,
  cachedChats,
  cachedMessages,
  cacheUsers,
  cachedUsers
} from '../../storage/localDb'
import type { ChatState } from '../composables/useChatState'

export function createChatPersistence(input: {
  state: ChatState
  fallbackNodeId: () => string
}) {
  const { state } = input

  async function loadConfig(): Promise<AppConfig> {
    try {
      return await api.config()
    } catch (error: unknown) {
      state.connectionLabel.value = 'Offline, saving locally'
      return { nodeRole: 'central', nodeId: input.fallbackNodeId() }
    }
  }

  async function loadUsers(): Promise<void> {
    try {
      const users = await api.users()
      state.users.value = users
      await cacheUsers(users)
    } catch (error: unknown) {
      const users = await cachedUsers()
      state.users.value = users
      if (users.length === 0) throw error
    }
  }

  async function refreshChats(): Promise<void> {
    try {
      const chats = await api.chats(state.currentUserId.value)
      state.setChats(chats)
      await cacheChats(state.currentUserId.value, chats)
    } catch (error: unknown) {
      const chats = await cachedChats(state.currentUserId.value)
      state.setChats(chats)
      if (chats.length === 0) throw error
    }
  }

  async function loadActiveMessages(): Promise<void> {
    if (!state.activeChatId.value) return
    const activeChatId = state.activeChatId.value
    const activeChat = state.activeChat.value

    if (activeChat?.syncStatus === 'local') {
      state.setMessages(activeChatId, await cachedMessages(activeChatId))
      return
    }

    try {
      const messages = await api.messages(activeChatId, state.currentUserId.value)
      state.setMessages(activeChatId, messages)
      await cacheMessages(activeChatId, messages)
    } catch (error: unknown) {
      const messages = await cachedMessages(activeChatId)
      state.setMessages(activeChatId, messages)
      if (!activeChat && messages.length === 0) throw error
    }
  }

  async function persistVisibleState(chatId?: string | null): Promise<void> {
    await cacheChats(state.currentUserId.value, state.chats.value)
    if (chatId) {
      const messages = state.activeChatId.value === chatId ? state.activeMessages.value : await cachedMessages(chatId)
      await cacheMessages(chatId, messages)
    }
  }

  return {
    loadConfig,
    loadUsers,
    refreshChats,
    loadActiveMessages,
    persistVisibleState
  }
}
