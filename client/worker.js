const clientStates = new Map()
const CLIENT_STATE_TTL_MS = 5 * 60 * 1000

function normaliseNotificationData(event) {
  if (event.type === 'push') {
    return event.data ? event.data.json() : {}
  }

  return event.data || {}
}

async function showChatNotification(event) {
  const data = normaliseNotificationData(event)
  if (data.type && data.type !== 'CHAT_NOTIFICATION') return

  const title = data.title || 'New chat message'
  const options = {
    body: data.body || data.message || 'Open the chat to read it.',
    tag: data.messageId ? `message-${data.messageId}` : data.chatId ? `chat-${data.chatId}` : 'field-chat',
    data: {
      chatId: data.chatId,
      messageId: data.messageId,
      userId: data.userId
    }
  }

  await self.registration.showNotification(title, options)
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  event.waitUntil(showChatNotification(event))
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'CLIENT_STATE') {
    rememberClientState(event.source, data)
    return
  }

  event.waitUntil(showChatNotification(event))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const chatId = event.notification.data?.chatId
  const userId = event.notification.data?.userId
  const targetUrl = notificationTargetUrl(chatId, userId)

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = matchingClient(clientList, userId)
      if (existing) {
        existing.focus()
        existing.postMessage({ type: 'OPEN_CHAT', chatId, userId })
        return
      }
      return clients.openWindow(targetUrl)
    })
  )
})

function notificationTargetUrl(chatId, userId) {
  const params = new URLSearchParams()
  if (chatId) params.set('chat', chatId)
  if (userId) params.set('user', userId)
  const query = params.toString()
  return query ? `/?${query}` : '/'
}

function rememberClientState(source, data) {
  pruneClientStates()
  if (!source || !source.id || typeof data.userId !== 'string') return
  clientStates.set(source.id, {
    userId: data.userId,
    url: typeof data.url === 'string' ? data.url : '',
    updatedAt: Date.now()
  })
}

function matchingClient(clientList, userId) {
  pruneClientStates(clientList)
  if (!userId) return clientList.find((client) => 'focus' in client)

  const stateMatch = clientList.find((client) => {
    if (!('focus' in client)) return false
    const state = clientStates.get(client.id)
    return state?.userId === userId
  })
  if (stateMatch) return stateMatch

  return clientList.find((client) => {
    if (!('focus' in client)) return false
    try {
      return new URL(client.url).searchParams.get('user') === userId
    } catch (_error) {
      return false
    }
  })
}

function pruneClientStates(clientList) {
  const now = Date.now()
  const currentClientIds = clientList ? new Set(clientList.map((client) => client.id)) : null

  for (const [clientId, state] of clientStates.entries()) {
    const isExpired = now - state.updatedAt > CLIENT_STATE_TTL_MS
    const isClosed = currentClientIds ? !currentClientIds.has(clientId) : false
    if (isExpired || isClosed) clientStates.delete(clientId)
  }
}
