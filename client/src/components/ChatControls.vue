<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ChatApp } from '../chat/composables/useChatApp'

const props = defineProps<{
  app: ChatApp
}>()

const directUserId = ref('')
const groupTitle = ref('Field outage group')
const groupMembers = ref<string[]>([])

const availableUsers = computed(() =>
  props.app.users.value.filter((user) => user.id !== props.app.currentUserId.value)
)

watch(
  availableUsers,
  (users) => {
    if (!users.some((user) => user.id === directUserId.value)) {
      directUserId.value = users[0]?.id ?? ''
    }

    const validSelected = groupMembers.value.filter((id) => users.some((user) => user.id === id))
    groupMembers.value = validSelected.length > 0 ? validSelected : users.slice(0, 2).map((user) => user.id)
  },
  { immediate: true }
)

async function openDirectChat(): Promise<void> {
  if (!directUserId.value) return
  await props.app.createDirectChat(directUserId.value)
}

async function submitGroupChat(): Promise<void> {
  if (!groupTitle.value.trim() || groupMembers.value.length === 0) return
  await props.app.createGroupChat(groupTitle.value.trim(), groupMembers.value)
}

async function onUserChange(event: Event): Promise<void> {
  const input = event.target as HTMLSelectElement
  await props.app.changeUser(input.value)
}
</script>

<template>
  <section class="toolbar-card">
    <div class="toolbar-section identity-section">
      <h2>Current user</h2>
      <label>
        Demo user
        <select :value="app.currentUserId.value" @change="onUserChange">
          <option v-for="user in app.users.value" :key="user.id" :value="user.id">
            {{ user.name }}&nbsp;&ndash;&nbsp;{{ user.role }}
          </option>
        </select>
      </label>
    </div>

    <div class="toolbar-section personal-section">
      <h2>Personal chat</h2>
      <div class="toolbar-row">
        <label>
          Direct chat with
          <select v-model="directUserId">
            <option v-for="user in availableUsers" :key="user.id" :value="user.id">
              {{ user.name }}
            </option>
          </select>
        </label>
        <button type="button" @click="openDirectChat">Open or create</button>
      </div>
    </div>

    <div class="toolbar-section group-section">
      <div class="group-chat-layout">
        <div class="group-title-area">
          <h2>Group chat</h2>
          <div class="group-title-stack">
            <label>
              Group title
              <input v-model="groupTitle" />
            </label>
            <button type="button" @click="submitGroupChat">Create group</button>
          </div>
        </div>

        <label class="group-members-field">
          Group members
          <select v-model="groupMembers" multiple size="4">
            <option v-for="user in availableUsers" :key="user.id" :value="user.id">
              {{ user.name }}
            </option>
          </select>
        </label>
      </div>
    </div>
  </section>
</template>
