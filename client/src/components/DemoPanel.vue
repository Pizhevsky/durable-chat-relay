<script setup lang="ts">
import { computed } from 'vue'
import type { ChatApp } from '../chat/composables/useChatApp'
import { clientConfig } from '../config/clientConfig'

const props = defineProps<{
  app: ChatApp
}>()

const demoUsers = computed(() =>
  props.app.users.value
    .filter((user) => user.id !== props.app.currentUserId.value)
    .slice(0, clientConfig.demo.maxAlternateUserButtons)
)

const notificationButtonLabel = computed(() => {
  if (props.app.notificationPermission.value === 'granted') return 'Notifications allowed'
  if (props.app.notificationPermission.value === 'denied') return 'Notifications blocked'
  if (props.app.notificationPermission.value === 'unsupported') return 'Notifications unavailable'
  return 'Allow notifications'
})

const canRequestNotifications = computed(() => props.app.notificationPermission.value === 'default')
</script>

<template>
  <section class="demo-card">
    <div>
      <h2>One-computer demo</h2>
      <p>
        Open another user in a separate window to simulate a second field laptop.
        Toggle local-only mode in this tab, send messages while the socket is
        unavailable, and watch the browser keep every pending event in IndexedDB.
        Reconnect when ready to see the outbox flush, sync statuses update, and
        notifications behave like they would during an interrupted work session.
      </p>
      <p v-if="app.demo.localOnly.value" class="local-only-warning">
        Saved in this browser only. Other users may not see these messages until
        this tab reconnects or an already-established peer channel replicates them.
      </p>
    </div>
    <div class="demo-actions">
      <div class="demo-action-group">
        <h3>Users</h3>
        <button
          v-for="user in demoUsers"
          :key="user.id"
          class="secondary"
          type="button"
          @click="app.demo.openUserWindow(user.id)"
        >
          Open {{ user.name }} window
        </button>
      </div>

      <div class="demo-action-group">
        <h3>System</h3>
        <button
          v-if="!app.demo.localOnly.value"
          class="warning"
          type="button"
          @click="app.demo.enableLocalOnly"
        >
          Simulate local-only tab
        </button>
        <button v-else class="success" type="button" @click="app.demo.disableLocalOnly">Reconnect this tab</button>
        <button
          class="secondary"
          :class="{ success: app.notificationPermission.value === 'granted' }"
          type="button"
          :disabled="!canRequestNotifications"
          @click="app.requestNotifications"
        >
          {{ notificationButtonLabel }}
        </button>
        <button class="secondary" type="button" @click="app.demo.showNotification">Test notification</button>
        <small v-if="app.notificationStatus.value" class="demo-action-note">{{ app.notificationStatus.value }}</small>
      </div>
    </div>
  </section>
</template>
