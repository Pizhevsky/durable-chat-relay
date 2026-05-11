<script setup lang="ts">
import type { ChatApp } from '../chat/composables/useChatApp'
import { clientConfig } from '../config/clientConfig'

defineProps<{
  app: ChatApp
}>()

function shortDeviceId(deviceId: string): string {
  const length = clientConfig.deviceIdPreviewLength
  return deviceId.length > length ? `${deviceId.slice(0, length)}...` : deviceId
}
</script>

<template>
  <section class="hero-card">
    <div class="hero-main">
      <p class="eyebrow">Durable Chat Relay</p>
      <h1>
        Keep chatting through unreliable connectivity.
      </h1>
      <p class="hero-copy">
        A durable chat prototype for field teams working with unreliable connectivity. 
        Every action is saved before delivery, so messages and chats can survive browser 
        refreshes, local-only mode, helper-node sync, and later central reconciliation. 
        Create a direct or group chat and watch each event move from browser storage to 
        live delivery and central recovery.
      </p>
    </div>
    <div class="status-panel">
      <div class="status-group transport-status-grid">
        <h2>Transport</h2>
        <span class="status-pill">{{ app.connectionLabel.value }}</span>
        <span>Pending local events: <strong>{{ app.pendingCount.value }}</strong></span>
        <span>Demo local-only: <strong>{{ app.demo.localOnly.value ? 'on' : 'off' }}</strong></span>
      </div>

      <div class="status-group peer-status-grid">
        <h2>Peer fallback</h2>
        <span class="status-pill status-peer">{{ app.peerStatus.value }}</span>
        <span>ACKs received: <strong>{{ app.peerAckCount.value }}</strong></span>
        <span>Missing-event sync: <strong>{{ app.peerMissingSyncStatus.value }}</strong></span>
        <span>Last event received: <strong>{{ app.lastPeerEventType.value }}</strong></span>
      </div>

      <div class="status-group">
        <h2>Browser node</h2>
        <span>Notifications: <strong>{{ app.notificationPermission.value }}</strong></span>
        <span>Node: <strong>{{ app.nodeId() }}</strong></span>
        <span class="device" :title="app.deviceId">{{ shortDeviceId(app.deviceId) }}</span>
      </div>
    </div>
  </section>
</template>
