<script setup lang="ts">
import { ref } from 'vue'
import type { ChatApp } from '../chat/composables/useChatApp'
import {
  EMPTY_READ_RECEIPT_LABEL,
  participantDescription as describeParticipants,
  readReceiptLabel,
  syncStatusClass,
  syncStatusLabel
} from '../utils/chatLabels'
import { formatLocalDateTime } from '../utils/dates'

const props = defineProps<{
  app: ChatApp
}>()

const messageText = ref('')

async function send(): Promise<void> {
  const text = messageText.value
  messageText.value = ''
  await props.app.sendMessage(text)
}

function readLabel(readBy: string[]): string {
  const chat = props.app.activeChat.value
  if (!chat) return EMPTY_READ_RECEIPT_LABEL
  return readReceiptLabel(chat.members, readBy, props.app.currentUserId.value)
}

function participantDescription(): string {
  const chat = props.app.activeChat.value
  if (!chat) return ''
  return describeParticipants(chat.members, props.app.currentUserId.value)
}
</script>

<template>
  <section class="panel conversation">
    <template v-if="app.activeChat.value">
      <header class="conversation-header">
        <div>
          <h2>{{ app.activeChat.value.title }}</h2>
          <p>{{ participantDescription() }}</p>
        </div>
        <span class="sync-badge" :class="syncStatusClass(app.activeChat.value.syncStatus)">
          {{ syncStatusLabel(app.activeChat.value.syncStatus) }}
        </span>
      </header>

      <div class="messages">
        <article
          v-for="message in app.activeMessages.value"
          :key="message.id"
          class="message"
          :class="{ mine: message.senderId === app.currentUserId.value }"
        >
          <strong>{{ message.senderName }}</strong>
          <p>{{ message.text }}</p>
          <div class="message-meta">
            <small>{{ formatLocalDateTime(message.createdAt) }} · {{ readLabel(message.readBy) }}</small>
            <span class="sync-badge" :class="syncStatusClass(message.syncStatus)">
              {{ syncStatusLabel(message.syncStatus) }}
            </span>
          </div>
        </article>
      </div>

      <form class="composer" @submit.prevent="send">
        <input v-model="messageText" placeholder="Write a message that survives outages..." />
        <button type="submit">Send</button>
      </form>
    </template>
    <p v-else class="empty-state">Create or select a chat.</p>
  </section>
</template>
