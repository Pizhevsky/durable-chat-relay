import type {
  AppConfig,
  ChatEvent,
  ChatSummary,
  Message,
  RecoveryDump,
  SyncResponse,
  User
} from '../../../shared/types'
import {
  apiOrigin,
  apiUrl,
  canFallbackToDevHelper,
  storeAutomaticDevHelperOverride
} from './runtimeConfig'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const origin = apiOrigin()
  let response: Response

  try {
    response = await fetchWithJsonHeaders(apiUrl(path), options)
  } catch (error: unknown) {
    if (!canFallbackToDevHelper(origin)) throw error

    const helperOrigin = storeAutomaticDevHelperOverride()
    response = await fetchWithJsonHeaders(new URL(path, helperOrigin).toString(), options)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message ?? body.error ?? `Request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

function fetchWithJsonHeaders(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {})
    }
  })
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
  importRecovery: (dump: RecoveryDump) => request<SyncResponse>('/api/recovery/import', {
    method: 'POST',
    body: JSON.stringify(dump)
  })
}
