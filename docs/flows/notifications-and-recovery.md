# Notifications And Recovery Flows

## Notification Permission

1. User presses the notification permission button.
2. Browser shows native permission prompt if allowed.
3. App stores the current permission state in UI state.
4. Button changes based on permission result.

Possible states:

```txt
default
granted
denied
unsupported
```

Browser limitation:

If the user has denied notifications at browser/site level, the app cannot force the prompt to appear again.

## Test Notification

1. User presses **Test notification**.
2. App asks the service worker or browser notification API to show a demo notification.
3. A temporary in-app feedback message is shown.
4. Feedback hides after a short delay.

Purpose:

- proves permission and notification display path work
- does not prove backend Web Push is configured

## Foreground Incoming Message Notification

1. App receives an incoming `message.created` event.
2. App checks that the event is for the current user's chat.
3. App checks that the sender is not the current user.
4. If the app is hidden or notification rules allow it, app asks notification layer to show a message.
5. Notification includes `chatId` and `messageId`.

Ignored events:

- messages authored by current user
- messages for chats current user does not belong to
- malformed peer events rejected by membership validation

## Service Worker Push Flow

1. Browser receives a push event.
2. Service worker parses push payload.
3. If payload type is not a chat notification, worker ignores it.
4. Worker calls `showNotification()`.
5. Notification data includes chat id and message id.

Payload shape:

```json
{
  "type": "CHAT_NOTIFICATION",
  "title": "New chat message",
  "body": "Message preview",
  "chatId": "chat-id",
  "messageId": "message-id"
}
```

Current project note:

The service-worker bridge exists. Real backend Web Push requires VAPID configuration and push subscription storage.

## Notification Click

1. User clicks notification.
2. Service worker closes the notification.
3. Worker checks for existing app windows.
4. If a window exists, worker focuses it.
5. Worker posts `{ type: 'OPEN_CHAT', chatId }` to the focused window.
6. Vue app opens the chat from the message.
7. If no window exists, worker opens `/?chat=<chatId>`.

Result:

- clicking a notification should route the user to the relevant chat

## Recovery Export

1. User presses recovery export.
2. Browser reads local events from IndexedDB.
3. Browser creates a recovery dump JSON file.
4. Dump keeps original event authorship and device metadata.

Use cases:

- browser cannot reconnect soon
- field laptop is being replaced
- helper node needs manual support
- support wants to import unsynced event logs

## Recovery Import

1. User selects a recovery dump.
2. App validates dump format.
3. Browser imports events into local IndexedDB.
4. App also sends dump to server recovery import.
5. Server applies events idempotently.
6. Duplicates are ignored by `eventId`.

Trust boundary:

Recovery import is demo-trusted. Production must require real authentication, authorization and signed/verifiable events.

## Recovery Limits

Recovery can restore events that exist in the dump.

Recovery cannot restore:

- browser IndexedDB deleted before export
- incognito storage after window close
- events that were never saved
- another user's closed-browser local data
