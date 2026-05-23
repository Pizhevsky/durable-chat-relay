<script setup lang="ts">
import type { ChatApp } from '../chat/composables/useChatApp'
import { syncStatusClass, syncStatusLabel } from '../utils/chatLabels'

defineProps<{
  app: ChatApp
}>()
</script>

<template>
  <aside class="panel chat-list">
    <h2 id="chat-list-title">Chats</h2>
    <div class="chat-list-items">
      <button
        v-for="chat in app.chats.value"
        :key="chat.id"
        class="chat-row"
        :class="{ active: app.activeChatId.value === chat.id }"
        type="button"
        :aria-current="app.activeChatId.value === chat.id ? 'true' : undefined"
        :aria-label="`${chat.title}, ${chat.type} chat with ${chat.members.length} members, ${syncStatusLabel(chat.syncStatus)}`"
        @click="app.openChat(chat.id)"
      >
        <span>{{ chat.title }}</span>
        <small>{{ chat.type }} · {{ chat.members.length }} members</small>
        <span class="sync-badge" :class="syncStatusClass(chat.syncStatus)">{{ syncStatusLabel(chat.syncStatus) }}</span>
        <small v-if="chat.directPairKey">pair: {{ chat.directPairKey }}</small>
        <strong v-if="chat.unreadCount" class="unread-badge">{{ chat.unreadCount }} new</strong>
      </button>
      <p v-if="app.chats.value.length === 0" class="empty-state">
        No chats yet. Create a direct chat or group to start the demo.
      </p>
    </div>
  </aside>
</template>
