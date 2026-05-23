# Shared Integration Contract

This document is duplicated in both repositories so the integration rules stay visible from either side.

There are two separate projects:

```txt
Original Durable Chat Relay project
  Vue client + Node helper + optional original Node central

Laravel central server project
  Laravel 12 HTTP central API + PostgreSQL durable event store
```

For the Laravel integration path:

```txt
Vue client :1234
   |
   | Socket.IO and helper API
   v
Original Node helper :3001
   |
   | signed HTTP sync
   v
Laravel central :8000
   |
   v
PostgreSQL
```

## Transport boundary

The Vue client does not talk directly to Laravel. It talks to the Node helper because the client uses Socket.IO and local recovery behaviour owned by the original project.

Only the helper sends signed HTTP sync requests to the central server.

## Protected helper sync endpoints

```http
POST /api/sync/events
GET  /api/sync/events?since=...&limit=...
```

Central implementations may also protect recovery import/export when used as helper/operator endpoints.

## Helper signature headers

```txt
X-DCR-Helper-Id
X-DCR-Timestamp
X-DCR-Signature
```

The signature payload is:

```txt
timestamp + "\n" + method + "\n" + path-with-query + "\n" + raw-body
```

The browser must not contain the helper secret.

Local demo values:

```env
DCR_HELPER_SHARED_SECRET=local-dev-helper-secret
DCR_TRUSTED_HELPER_IDS=helper-demo
DCR_HELPER_SIGNATURE_TOLERANCE_SECONDS=300
```

## Sync request and response shapes

Push request:

```http
POST /api/sync/events
```

```json
{
  "sourceNodeId": "helper-demo",
  "sourceDeviceId": "browser-device-id",
  "events": []
}
```

Push response:

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

Pull request:

```http
GET /api/sync/events?since=0&limit=200
```

Pull response:

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

## Sync response expectations

A central sync response should identify accepted events, duplicates, conflicts and any authoritative server events needed for reconciliation.

The helper uses these fields to:

```txt
mark local events as central-synced
avoid retrying permanent conflicts
apply central events missed during outage
remap duplicate direct chat ids to the authoritative central chat id
advance the pull cursor only to the last returned sequence
```

`latestSequence` is the last sequence returned in the current response. It must not jump to the database maximum when the response is paged, otherwise helpers can skip missed central events.

## Event shape

Both central implementations accept the same event envelope:

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

## Direct chat reconciliation

Direct chat identity is based on a canonical pair key. If two helpers create the same direct chat offline, the central server keeps one authoritative chat and returns enough information for the losing helper to remap its local chat id.

## Central implementations

The original Node central and the Laravel central should follow the same helper sync contract. They differ in implementation and storage, not in the helper-facing contract.
