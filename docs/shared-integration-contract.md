# Shared Integration Contract

This document is intentionally duplicated in both repositories so the integration rules stay visible from either side.

The combined system has two different projects with separate responsibilities:

```txt
Original Durable Chat Relay project
  Vue client + Node helper + optional original Node central

Laravel central server project
  Laravel 12 HTTP central API + PostgreSQL durable event store
```

For the Laravel integration path, the runtime shape is:

```txt
Vue client :1234
   |
   | Socket.IO and helper API
   v
Original Node helper :3001
   |
   | signed HTTP sync
   v
Laravel central API :8000
   |
   v
PostgreSQL
```

Do not point the Vue client directly at Laravel. Laravel does not host the Socket.IO transport used by the existing client. The browser talks to the helper. The helper talks to Laravel.

## Run flow for Laravel central

Start Laravel in the Laravel repository:

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000
```

Start the helper and client in the original repository:

```bash
npm install
npm run dev:laravel
```

Open:

```txt
http://localhost:1234?api=http://localhost:3001
```

`npm run dev:laravel` starts the Node helper on port `3001` and the Vue client on port `1234`. It does not start the old Node central server.

## Run flow for the original Node central

The original project can still run its own central server for comparison and original demos:

```bash
npm run dev
```

This starts:

```txt
Vue client :1234 -> Node central :3000 -> SQLite
```

Use this only when testing the original Node central path. It is not the Laravel integration path.

## Helper to central authorization

Helper sync requests are signed with HMAC SHA 256.

Required headers:

```txt
X-DCR-Helper-Id
X-DCR-Timestamp
X-DCR-Signature
```

The signature payload is:

```txt
timestamp + "\n" + method + "\n" + path-with-query + "\n" + raw-body
```

Examples of signed paths:

```txt
POST /api/sync/events
GET  /api/sync/events?since=0&limit=200
```

Both central implementations verify the same helper signature contract:

```txt
Laravel central verifies signed helper sync requests.
Original Node central verifies signed helper sync requests.
```

Local demo secret used by both projects:

```env
DCR_HELPER_SHARED_SECRET=local-dev-helper-secret
DCR_TRUSTED_HELPER_IDS=helper-demo
DCR_HELPER_SIGNATURE_TOLERANCE_SECONDS=300
```

This is helper to central authorization. It is not full user authentication, signed browser events, message encryption, or production key rotation.

## Sync endpoints

The helper pushes pending events:

```http
POST /api/sync/events
```

Request shape:

```json
{
  "sourceNodeId": "helper-demo",
  "events": []
}
```

Response shape:

```json
{
  "accepted": [],
  "duplicates": [],
  "conflicts": [],
  "serverEvents": [],
  "nodeRole": "central",
  "nodeId": "laravel-central",
  "centralNodeId": "laravel-central"
}
```

The helper pulls missed central events:

```http
GET /api/sync/events?since=0&limit=200
```

Response shape:

```json
{
  "nodeRole": "central",
  "nodeId": "laravel-central",
  "centralNodeId": "laravel-central",
  "latestSequence": 10,
  "currentSequence": 12,
  "hasMore": true,
  "events": []
}
```

`latestSequence` is the last sequence returned in the current response. It must not jump to the database maximum when the response is paged. This prevents helpers from skipping missed central events.

## Event shape

Both projects use the same event shape:

```json
{
  "eventId": "device-1:event-1",
  "originNodeId": "helper-demo",
  "originDeviceId": "device-1",
  "actorUserId": "u-denis",
  "chatId": "chat-1",
  "type": "message.created",
  "payload": {},
  "createdAt": "2026-05-22T00:00:00.000Z",
  "logicalClock": 1,
  "syncStatus": "local"
}
```

Supported event types:

```txt
chat.created
member.added
member.removed
message.created
message.read
```

Supported sync status values:

```txt
local
peer-replicated
helper-synced
central-synced
conflict
```

## Multi helper direct chat reconciliation

The central server is authoritative for direct chat identity.

Scenario:

```txt
Helper A creates direct chat chat-a for Denis and Anna while offline.
Helper B creates direct chat chat-b for Denis and Anna while offline.
Helper A syncs first.
Helper B syncs later.
```

Expected result:

```txt
Central keeps one canonical direct chat.
The later helper receives the accepted central chat event.
The helper remaps its local duplicate chat id to the central chat id.
Pending local messages for the losing chat id are rewritten before retry.
The browser state also reconciles to the central chat id.
```

This rule applies when the central server is Laravel and when the central server is the original Node central.

## Clean demo reset

When switching between central implementations or repeating conflict demos, reset all participating stores:

```txt
Laravel PostgreSQL database, if using Laravel central
original central SQLite database, if using original central
helper SQLite database
browser localStorage
browser sessionStorage
browser IndexedDB
```

Mixed old state can make direct chat reconciliation and cursor demos look wrong because each layer may remember a different event sequence.


## SHA-256 recovery checksum

Recovery exports include a SHA-256 checksum calculated from the canonical events payload. Recovery import verifies this checksum before accepting or previewing events, so truncated or manually corrupted dumps are rejected instead of being applied silently.
