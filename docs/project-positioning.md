# Project Positioning

## What This Project Demonstrates

- modern Vue 3 Composition API structure
- TypeScript contracts shared across client and server
- Express as web server and realtime gateway
- Socket.IO room-based chat delivery
- SQLite-backed event persistence
- browser IndexedDB outbox for durable local intent
- cached browser state for reopening with no server connection
- helper-node push/pull sync for temporary field-office resilience
- service-worker notification bridge
- recovery dump export/import
- practical distributed-system thinking without overclaiming production readiness

## Repository Description

```txt
Chat prototype for field teams with unreliable connectivity.
Built with Vue 3, TypeScript, Express, Socket.IO, SQLite,
IndexedDB recovery and helper-node sync.
```

## Suggested Repository Name

```txt
durable-chat-relay
```

Alternative names:

```txt
vue-durable-chat
field-chat-resilience-lab
vue-realtime-chat-lab
durable-chat
```

## Known Limitations

- demo authentication only
- architecture can support real auth, but this implementation uses demo headers
- SQLite is used for simplicity and local runnability
- helper discovery is manual
- WebRTC event replication requires peers to be signaled before the outage
- full serverless discovery is not complete yet
- production security, access control, and encryption would need more work
- REST event publishing uses demo-auth headers, not production authentication
- `POST /api/sync/events` and recovery import are demo-trusted replication paths

## Why This Matters

The interesting part is not that this is a chat app. The interesting part is
the failure model.

The design assumes that connectivity can fail at several layers:

```txt
central server unreachable
helper unavailable
browser tab closed
socket reconnects after events were created
same event arrives more than once
field laptop needs a manual recovery path
```

The project responds with layered resilience:

```txt
central persistence
helper persistence
browser IndexedDB
idempotent event IDs
service-worker notifications
recovery dumps
peer-assisted WebRTC replication
```
