# Helper Node

## Purpose

The helper node is the local resilience layer. It sits between the Vue client and a central server.

```txt
Vue client -> Node helper -> central server
```

The central server may be either:

```txt
original Node central on :3000
Laravel central on :8000
```

## What the helper owns

- Socket.IO connection for the Vue client
- helper SQLite event store
- local broadcast for users connected to the helper
- pending event queue
- signed push sync to central
- signed pull sync from central
- retry with backoff while central is unavailable
- applying authoritative central events returned by sync
- remapping duplicate direct chat ids to the central chat id

## What the helper does not own

The helper is not the authoritative central server. It can keep local users working, but central decides official history.

The helper should not invent central sequence numbers or treat local duplicate direct chat ids as authoritative after central reconciliation.

## Run helper against original Node central

Start original central:

```bash
npm run dev:central
```

Start helper:

```bash
npm run dev:helper
```

The helper points to:

```txt
http://localhost:3000
```

## Run helper against Laravel central

Start Laravel central in the Laravel repository:

```bash
php artisan serve --host=127.0.0.1 --port=8000
```

Start helper:

```bash
npm run helper:laravel
```

The helper points to:

```txt
http://127.0.0.1:8000
```

## Sync loop

The helper periodically:

```txt
1. finds events not yet central synced
2. signs POST /api/sync/events
3. marks accepted and duplicate events as central synced
4. applies serverEvents returned by central
5. signs GET /api/sync/events?since=...&limit=...
6. applies missed central events
7. stores latestSequence as the next cursor
```

## Direct chat remap

If central returns an accepted `chat.created` event for a direct pair that already exists locally under another chat id, the helper remaps the local duplicate id to the central id.

The helper must update:

```txt
helper chat row
chat members
messages
pending event payloads
local projections sent to clients
```

The browser should also reconcile its local state when it receives the authoritative central event.

## Clean reset

Before testing helper sync or direct chat reconciliation, clear:

```txt
helper SQLite database
browser localStorage/sessionStorage/IndexedDB
central database used for the test
```
