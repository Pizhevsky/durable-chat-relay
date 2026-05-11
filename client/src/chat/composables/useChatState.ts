import { computed, reactive, ref } from 'vue'
import type {
  ChatEvent,
  ChatSummary,
  PeerDirectoryEntry,
  Message,
  User,
  UserId
} from '../../../../shared/types'
import { clientConfig } from '../../config/clientConfig'
import { canonicalDirectPairKey } from '../../utils/chatIdentity'
import { createChatEventApplier } from '../events/chatEventApplier'

export function useChatState() {
  const users = ref<User[]>([])
  const chats = ref<ChatSummary[]>([])
  const messagesByChat = reactive<Record<string, Message[]>>({})
  const activeChatId = ref<string | null>(null)
  const currentUserId = ref(
    userFromUrl() ?? localStorage.getItem(clientConfig.storageKeys.selectedUserId) ?? clientConfig.defaultUserId
  )
  const connectionLabel = ref('starting')
  const peerStatus = ref('Peer fallback: ready')
  const peerAckCount = ref(0)
  const peerMissingSyncStatus = ref('idle')
  const lastPeerEventType = ref('none')
  const peerDirectory = ref<PeerDirectoryEntry[]>([])
  const pendingCount = ref(0)
  const lastError = ref<string | null>(null)
  const recentEvents = ref<ChatEvent[]>([])

  const activeChat = computed(() => chats.value.find((chat) => chat.id === activeChatId.value) ?? null)
  const activeMessages = computed(() => activeChatId.value ? messagesByChat[activeChatId.value] ?? [] : [])

  function setCurrentUser(userId: string): void {
    currentUserId.value = userId
    localStorage.setItem(clientConfig.storageKeys.selectedUserId, userId)
  }

  function setChats(nextChats: ChatSummary[]): void {
    chats.value = nextChats
    if (!activeChatId.value || !nextChats.some((chat) => chat.id === activeChatId.value)) {
      activeChatId.value = nextChats[0]?.id ?? null
    }
  }

  function setPresence(presence: Record<UserId, boolean>): void {
    users.value = users.value.map((user) => ({
      ...user,
      isOnline: Boolean(presence[user.id])
    }))
  }

  function setPeerDirectory(peers: PeerDirectoryEntry[]): void {
    peerDirectory.value = peers
  }

  function upsertChat(chat: ChatSummary): void {
    const index = chats.value.findIndex((item) => item.id === chat.id)
    if (index >= 0) chats.value[index] = chat
    else chats.value.unshift(chat)
  }

  function removeChat(chatId: string): void {
    chats.value = chats.value.filter((chat) => chat.id !== chatId)
    delete messagesByChat[chatId]
    if (activeChatId.value === chatId) activeChatId.value = chats.value[0]?.id ?? null
  }

  function setMessages(chatId: string, messages: Message[]): void {
    messagesByChat[chatId] = messages
  }

  function upsertMessage(message: Message): void {
    const messages = messagesByChat[message.chatId] ?? []
    const index = messages.findIndex((item) =>
      item.id === message.id || item.clientMessageId === message.clientMessageId
    )
    if (index >= 0) messages[index] = message
    else messages.push(message)
    messagesByChat[message.chatId] = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  function remapChatId(fromChatId: string, toChatId: string): void {
    if (fromChatId === toChatId) return

    const fromChat = chats.value.find((chat) => chat.id === fromChatId)
    const toChat = chats.value.find((chat) => chat.id === toChatId)
    if (fromChat && !toChat) {
      fromChat.id = toChatId
      fromChat.clientChatId = toChatId
    } else {
      chats.value = chats.value.filter((chat) => chat.id !== fromChatId)
    }

    const fromMessages = messagesByChat[fromChatId] ?? []
    if (fromMessages.length > 0) {
      const toMessages = messagesByChat[toChatId] ?? []
      messagesByChat[toChatId] = [...toMessages, ...fromMessages.map((message) => ({ ...message, chatId: toChatId }))]
      delete messagesByChat[fromChatId]
    }

    if (activeChatId.value === fromChatId) activeChatId.value = toChatId
  }

  function findDirectChat(otherUserId: string): ChatSummary | null {
    const pairKey = canonicalDirectPairKey(currentUserId.value, otherUserId)
    return chats.value.find((chat) => chat.type === 'direct' && chat.directPairKey === pairKey) ?? null
  }

  const { applyEvent } = createChatEventApplier({
    users,
    chats,
    messagesByChat,
    activeChatId,
    currentUserId,
    recentEvents,
    upsertChat,
    removeChat,
    upsertMessage
  })

  function userFromUrl(): string | null {
    try {
      return new URLSearchParams(window.location.search).get('user')
    } catch (_error) {
      return null
    }
  }

  return {
    users,
    chats,
    activeChatId,
    activeChat,
    activeMessages,
    currentUserId,
    connectionLabel,
    peerStatus,
    peerAckCount,
    peerMissingSyncStatus,
    lastPeerEventType,
    peerDirectory,
    pendingCount,
    lastError,
    recentEvents,
    setCurrentUser,
    setPresence,
    setPeerDirectory,
    setChats,
    upsertChat,
    removeChat,
    setMessages,
    upsertMessage,
    remapChatId,
    findDirectChat,
    applyEvent
  }
}

export type ChatState = ReturnType<typeof useChatState>
