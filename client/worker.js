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
      messageId: data.messageId
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
  event.waitUntil(showChatNotification(event))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const chatId = event.notification.data?.chatId
  const targetUrl = chatId ? `/?chat=${encodeURIComponent(chatId)}` : '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((client) => 'focus' in client)
      if (existing) {
        existing.focus()
        existing.postMessage({ type: 'OPEN_CHAT', chatId })
        return
      }
      return clients.openWindow(targetUrl)
    })
  )
})
