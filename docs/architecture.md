# Architecture

Durable Chat Relay separates local availability from central authority.

The original project owns the browser-facing runtime: Vue client, Socket.IO, Node central mode, Node helper mode, IndexedDB recovery and WebRTC peer fallback. The Laravel project is an optional second central implementation for the helper sync path.

## Runtime paths

### Original direct mode

```txt
Vue client :1234
   |
   | Socket.IO
   v
Node central :3000
   |
   v
SQLite central event store
```

Use this for the normal standalone demo:

```bash
npm run dev
```

### Helper with original Node central

```txt
Vue client :1234
   |
   | Socket.IO
   v
Node helper :3001
   |
   | signed HTTP sync
   v
Node central :3000
   |
   v
SQLite central event store
```

Use this to show helper sync and central outage recovery while staying fully inside the original project.

### Helper with Laravel central

```txt
Vue client :1234
   |
   | Socket.IO
   v
Node helper :3001
   |
   | signed HTTP sync
   v
Laravel central :8000
   |
   v
PostgreSQL event store
```

Use this to show the additional PHP/PostgreSQL central authority.

## Responsibility split

| Concern | Owner |
|---|---|
| Browser UI and demo user switching | Original Vue client |
| Socket.IO transport | Original Node central/helper |
| Browser outbox and cache | IndexedDB in the original client |
| Helper local queue | Node helper SQLite |
| Peer assisted fallback | Original client and Node signalling |
| Original central demo | Node central + SQLite |
| Additional central authority | Laravel + PostgreSQL |
| Helper-to-central trust | HMAC signed sync requests |

## Failure model

The project focuses on these cases:

```txt
central available -> normal realtime delivery
central unavailable but helper available -> helper stores and retries
no central/helper -> browser stores in IndexedDB and may use existing WebRTC peers
central returns -> signed sync, deduplication and projection rebuild official state
```

The central server, whether Node or Laravel, deduplicates by `eventId`. The helper owns retry and backoff. The browser owns local recovery before delivery.

## Behaviour flows

For step-by-step runtime behaviour, see:

- [Messaging and sync](flows/messaging-and-sync.md) for chat creation, message delivery, helper sync and cursor pull.
- [Resilience and failure](flows/resilience-and-failure.md) for local-only mode, helper outage, central outage, direct chat reconciliation and WebRTC fallback.
- [Notifications and recovery](flows/notifications-and-recovery.md) for notification behaviour and recovery export/import.
- [User lifecycle](flows/user-lifecycle.md) for demo user switching and peer/session cleanup.
