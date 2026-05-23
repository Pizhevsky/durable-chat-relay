<script setup lang="ts">
import { useChatApp } from './chat/composables/useChatApp'
import ChatControls from './components/ChatControls.vue'
import ChatList from './components/ChatList.vue'
import ConversationPanel from './components/ConversationPanel.vue'
import DemoPanel from './components/DemoPanel.vue'
import HeroStatus from './components/HeroStatus.vue'
import RecoveryPanel from './components/RecoveryPanel.vue'

defineOptions({ name: 'App' })

const app = useChatApp()
</script>

<template>
  <main class="app-shell">
    <HeroStatus :app="app" />
    <DemoPanel :app="app" />
    <ChatControls :app="app" />

    <section class="grid">
      <ChatList :app="app" />
      <ConversationPanel :app="app" />
      <RecoveryPanel :app="app" />
    </section>

    <button
      v-if="app.inAppNotification.value"
      class="in-app-notification"
      type="button"
      @click="app.openChat(app.inAppNotification.value.chatId)"
    >
      <strong>{{ app.inAppNotification.value.title }}</strong>
      <span>{{ app.inAppNotification.value.body }}</span>
    </button>
    <output v-if="app.inAppNotification.value" class="sr-only" aria-live="polite">
      {{ app.inAppNotification.value.title }}. {{ app.inAppNotification.value.body }}
    </output>
  </main>
</template>
