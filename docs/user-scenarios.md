# User Scenarios

This document describes the user visible behaviour of Durable Chat Relay and how those behaviours interact with the helper and central server choices.

The project has two central paths:

```txt
Original path:
Vue client -> Node central -> SQLite

Laravel integration path:
Vue client -> Node helper -> Laravel central -> PostgreSQL
```

The client should talk to the helper when using Laravel. Laravel is not a Socket.IO server for the Vue client.

## Actors

The demo users are:

```txt
Denis
Anna
Mark
Kate
Ivan
```

Any user can open the app in a separate browser window. Demo user switching is stored locally so the project can show multi user scenarios on one machine.

## Normal online chat

1. Denis opens the app.
2. Denis creates or selects a chat with Anna.
3. Denis sends a message.
4. The browser saves the event locally before network delivery.
5. The current transport sends it to central or helper.
6. Central stores the event once by `eventId`.
7. Anna receives the event if her window is online.

Expected result:

```txt
message appears immediately for Denis
online receivers see it in realtime
refresh reloads official history from central/helper state
```

## Helper path with Laravel central

1. Laravel central runs on `:8000`.
2. Node helper runs on `:3001`.
3. Vue client connects to helper through `?api=http://localhost:3001`.
4. Helper stores local events in helper SQLite.
5. Helper signs sync requests to Laravel.
6. Laravel verifies the helper signature.
7. Laravel stores and projects central state in PostgreSQL.

Expected result:

```txt
browser remains unchanged
helper owns Socket.IO
Laravel owns central event correctness
```

## Central outage while helper is available

1. Users are connected to the helper.
2. Central becomes unavailable.
3. Users keep sending events through the helper.
4. Helper stores events locally and retries sync with backoff.
5. Central returns.
6. Helper signs pending event batches and syncs them.
7. Central deduplicates by `eventId`.

Expected result:

```txt
local helper users can keep working
central catches up later
retry does not create duplicate messages
```

## Sender uses local only mode

1. Denis clicks **Simulate local-only tab**.
2. Denis sends messages.
3. Denis sees messages locally because they are stored in IndexedDB.
4. Central/helper does not receive those events yet unless a peer path is available.
5. Denis reconnects.
6. Pending events retry automatically.

Important expectation:

```txt
local saved means safe in this browser, not delivered to everyone
```

## WebRTC peer fallback

1. Denis and Anna are online long enough for Socket.IO signalling.
2. The server sends a peer directory for users who share active chats.
3. A WebRTC data channel opens between browsers.
4. Denis loses central/helper transport.
5. Denis sends a message in a shared chat.
6. Anna can receive the peer replicated event if the channel is open.
7. Anna syncs the original event to central if she has central/helper access.
8. Central deduplicates if Denis later syncs the same event.

Expected result:

```txt
known active peers can help carry events
central still becomes the final authority after sync
```

## Duplicate direct chat across helpers

1. Helper A creates direct chat `chat-a` for Denis and Anna while central is unavailable.
2. Helper B creates direct chat `chat-b` for the same pair while central is unavailable.
3. Central returns.
4. Helper A syncs first.
5. Helper B syncs later.
6. Central keeps one canonical direct chat for the pair key `u-anna:u-denis`.
7. Helper B receives the canonical `chat.created` event.
8. Helper B remaps local `chat-b` to the central chat id.
9. Pending messages for `chat-b` are rewritten before retry.
10. Browser state reconciles after the authoritative central event is applied.

Expected result:

```txt
one direct chat remains
messages from both helpers land in the same central chat
local duplicate ids do not survive as separate official chats
```

This scenario should behave the same with the original Node central and with Laravel central.

## Demo user switching

A physical browser window can switch from one demo user to another. When this happens, stale session and peer state must be cleared.

Expected cleanup:

```txt
old Socket.IO rooms are left
old peer connections are cleared
new user identity is announced
new peer directory is loaded
visible chats and messages refresh for the selected user
```

This avoids a Kate window keeping stale peer state after it becomes Ivan.

## Recovery dump

1. User has unsynced browser events.
2. User exports a recovery dump.
3. The file contains local events with original authorship.
4. User or support imports it later.
5. Central applies events idempotently and deduplicates by event id.

Laravel adds a dry run option for recovery import:

```http
POST /api/recovery/import?dryRun=true
```

Dry run previews what would be accepted, duplicated or rejected without writing to PostgreSQL.

## Notifications

1. User grants browser notification permission.
2. If the app is hidden and receives an incoming message, it can show a notification.
3. Clicking the notification opens or focuses the relevant chat.

Limitations:

```txt
browser permission rules apply
production Web Push needs VAPID keys and subscription storage
notification focus must respect the currently selected demo user
```

## Trust and security boundaries

Current security improvements:

```txt
helper sync requests to central are HMAC signed
original Node central verifies signed helper sync
Laravel central verifies signed helper sync
peer signalling is scoped to shared chat members
```

Remaining production gaps:

```txt
real user authentication
per chat authorization
signed browser/device events
message encryption
key rotation
operator audit trail
production recovery controls
```

## Quick expectations

| User question | Honest answer |
|---|---|
| If I send while local only, is it safe? | It is safe in this browser IndexedDB. |
| Did everyone receive it? | Only central/helper/peer connected recipients. Offline users wait until sync. |
| Can I close the browser? | The app warns you. Others may not see local data until you reopen and sync. |
| Can WebRTC deliver to users who were never online? | No. It needs previous signalling. |
| Can duplicate direct chats happen? | Local duplicates can happen offline, but central remaps by pair key. |
| What if central receives the same event twice? | It stores one copy by `eventId`. |
| Can the Vue client connect directly to Laravel? | No. It must connect to the helper because Laravel does not provide Socket.IO. |
