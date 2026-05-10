import type {
  AppConfig,
  ChatEvent,
  ChatSummary,
  Message,
  RecoveryDump,
  SyncPullResponse,
  SyncResponse,
  User
} from '../../../shared/types'
import { apiUrl } from './runtimeConfig'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {})
    }
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message ?? body.error ?? `Request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const api = {
  config: () => request<AppConfig>('/api/config'),
  users: () => request<User[]>('/api/users'),
  chats: (userId: string) => request<ChatSummary[]>(`/api/chats?userId=${encodeURIComponent(userId)}`),
  messages: (chatId: string, userId: string) => request<Message[]>(
    `/api/chats/${encodeURIComponent(chatId)}/messages?userId=${encodeURIComponent(userId)}`
  ),
  publishEvent: (event: ChatEvent, userId: string) => request<ChatEvent>('/api/events', {
    method: 'POST',
    headers: { 'x-demo-user-id': userId },
    body: JSON.stringify(event)
  }),
  syncEvents: (events: ChatEvent[]) => request<SyncResponse>('/api/sync/events', {
    method: 'POST',
    body: JSON.stringify({ sourceNodeId: 'browser', events })
  }),
  pullEvents: (since: number) => request<SyncPullResponse>(
    `/api/sync/events?since=${encodeURIComponent(String(since))}`
  ),
  importRecovery: (dump: RecoveryDump) => request<SyncResponse>('/api/recovery/import', {
    method: 'POST',
    body: JSON.stringify(dump)
  })
}
