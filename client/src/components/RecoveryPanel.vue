<script setup lang="ts">
import type { ChatApp } from '../chat/composables/useChatApp'
import { syncStatusClass, syncStatusLabel } from '../utils/chatLabels'

const props = defineProps<{
  app: ChatApp
}>()

async function onImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await props.app.importDump(file)
  input.value = ''
}
</script>

<template>
  <aside class="panel recovery">
    <h2>Recovery tools</h2>
    <p>
      The browser stores local events before delivery. 
      Export a recovery dump if connection is unstable or before closing a field
      laptop that may contain unsynced events.
    </p>
    <button type="button" @click="app.retryPending">Retry pending events</button>
    <button type="button" @click="app.exportDump">Export recovery dump</button>
    <label class="file-button">
      Import recovery dump
      <input type="file" accept="application/json" @change="onImport" />
    </label>
    <p v-if="app.lastError.value" class="error" role="alert">{{ app.lastError.value }}</p>
    <div class="recent-events">
      <div class="event-log-header">
        <h3>Recent event flow</h3>
        <span>Scroll</span>
      </div>
      <div class="event-log" role="log" aria-live="polite" aria-label="Recent event flow">
        <article v-for="event in app.recentEvents.value" :key="event.eventId" class="event-row">
          <strong>{{ event.type }}</strong>
          <span class="event-row-meta">
            <span class="sync-badge" :class="syncStatusClass(event.syncStatus)">
              {{ syncStatusLabel(event.syncStatus) }}
            </span>
            <span>{{ event.actorUserId }}</span>
          </span>
          <small>{{ event.eventId }}</small>
        </article>
        <p v-if="app.recentEvents.value.length === 0" class="empty-state">No events in this tab yet.</p>
      </div>
    </div>
  </aside>
</template>
