# Durable Chat Relay

A chat prototype for field teams who need to keep working when connectivity becomes unreliable.

Durable Chat Relay uses Vue 3, TypeScript, Express, Socket.IO, SQLite,
IndexedDB recovery, helper-node sync, and peer-assisted WebRTC fallback to keep
chat actions recoverable before they reach the central server.

This project is a rethinking of an older chat system I built while
self-employed from **Feb 2021 to Feb 2022**. The original project used a Vue
chat widget, a Node.js Socket.IO gateway, service-worker notifications, and a
separate persistence backend. This version keeps the useful idea behind that
work, then rebuilds it as a clearer modern architecture.

This is a resilience prototype, not a production-secure messaging platform. It
uses demo user switching and demo-auth headers so the focus stays on event
recovery, helper sync, browser storage, and peer fallback.

## Core Idea

The system is designed for organisations where field offices can appear and
close several times per month. Installing a permanent server in every office is
not realistic. Instead, the architecture has several layers of resilience.

```txt
Central server available
  Browser -> central Express/Socket.IO server -> central SQLite event store

Central unavailable, helper available
  Browser -> lightweight helper node on a responsible user's laptop
  Helper -> helper SQLite event store -> later central sync

No central and no helper
  Browser stores events in IndexedDB
  Already-signaled browsers can replicate events to known peers through WebRTC
  Peer fallback is limited to already-signaled active chat members

Recovery
  Browser/helper uploads event logs to central
  Central deduplicates events and rebuilds official history
```

## What Works

- Vue 3 + TypeScript frontend
- Parcel frontend build
- Express web server
- Socket.IO realtime transport
- SQLite persistence with `better-sqlite3`
- Central mode and helper-node mode
- Event-based chat model
- Browser IndexedDB outbox using Dexie
- Cached users, chats, and messages for browser-only reopening
- Automatic pending-event retry when Socket.IO reconnects
- Recovery dump export/import with client-side format validation
- Service-worker notification bridge and notification-click chat opening
- One-computer local-only demo mode for IndexedDB recovery and retry
- Canonical direct-chat pair keys to prevent duplicate 1:1 chats
- WebRTC data-channel event replication between already-signaled chat peers
- Central/helper peer directory for active shared-chat peers, including local-only tabs
- Socket.IO peer signaling while central/helper connectivity is available
- Helper sync push/pull with simple exponential backoff
- Tests for persistence, idempotency, helper sync, IndexedDB, peer routing,
  notifications, and retry flow

## Quick Start

Install dependencies:

```bash
npm install
```

Run central server and Parcel client:

```bash
npm run dev
```

Open the client:

```txt
http://localhost:1234
```

The API server runs on:

```txt
http://localhost:3000
```

Run a helper node:

```bash
npm run dev:helper
```

The helper runs on:

```txt
http://localhost:3001
```

Point the dev UI at the helper API without rebuilding:

```txt
http://localhost:1234?api=http://localhost:3001
```

The override is saved in localStorage as `durable-chat-api`. Clear it in
DevTools or run:

```js
localStorage.removeItem('durable-chat-api')
```

Build and serve production output:

```bash
npm run build
npm run start
```

Run checks:

```bash
npm run typecheck
npm run test
```

## Documentation Map

Start here:

- [Architecture](docs/architecture.md): central, helper, browser, peer, and trust boundaries.
- [Demo Guide](docs/demo-guide.md): the complete one-computer demo script.
- [User Scenarios](docs/user-scenarios.md): what each user experiences under different conditions.
- [Runtime Flows](docs/flows/README.md): messaging, sync, notifications, recovery, and lifecycle flows.
- [WebRTC Peer Mode](docs/webrtc-peer-mode.md): peer protocol, ACKs, limits, and realistic claims.
- [Helper Node](docs/helper-node.md): how the local helper process is meant to be used.
- [Project Positioning](docs/project-positioning.md): portfolio framing, limitations, and repo naming.
- [Full Mesh Roadmap](docs/full-mesh-roadmap.md): remaining peer-mesh work.

## Main Demo

The fastest portfolio demo is:

1. Run `npm run dev`.
2. Open `http://localhost:1234`.
3. Open another demo user window from the **One-computer demo** panel.
4. Create a direct chat and exchange messages.
5. Click **Simulate local-only tab**.
6. Send messages while local-only.
7. Refresh the tab if desired.
8. Click **Reconnect this tab** and watch pending events flush.

The local-only flag is kept in `sessionStorage`, so a refreshed tab stays in
local-only mode until **Reconnect this tab** is clicked.

While local-only, another demo user's window receives the message before
reconnect only if a real WebRTC peer channel is already open. The server sends
a peer directory while users are connected, so shared-chat users can prepare
peer links before they pause central/helper chat delivery. Same-browser local
tab broadcasting is scoped to the same selected demo user and is not used as a
cross-user delivery shortcut.

For the full script, including duplicate direct-chat prevention, notifications,
recovery dumps, helper-node sync, and WebRTC visibility, see
[docs/demo-guide.md](docs/demo-guide.md).

## Key Concepts

Events, not only final rows, are the durable unit:

```txt
chat.created
member.added
member.removed
message.created
message.read
```

Events move through these states:

```txt
local
peer-replicated
helper-synced
central-synced
conflict
```

Direct chats use a canonical pair key built from sorted user IDs:

```txt
u-anna:u-denis
```

That lets the client and server prevent accidental duplicate 1:1 chats during
retry, helper sync, peer recovery, or recovery import.


## Scope of Local Features

Some features are intentionally local to one browser, tab, or selected demo user.

- **IndexedDB** stores events for the current browser profile. Other users cannot recover those events unless they are synced, peer-replicated, or exported/imported through a recovery dump.
- **Local-only mode** affects the current tab. It pauses central/helper chat delivery for that tab, but the server continues running and may still support peer directory updates and WebRTC signaling.
- **BroadcastChannel** only coordinates tabs from the same origin and selected demo user. It is not cross-user delivery.
- **Notification permission** belongs to the current browser/site permission state.
- **API override** is saved in this browser's `localStorage` and does not affect other users.
- **WebRTC peer fallback** only works for already-signaled active chat peers. It does not discover closed browsers or unknown users.

## Data Security Model

This project focuses on resilience and recovery rather than production security. Browser IndexedDB records, helper-node sync payloads, peer events, and recovery dumps are treated as recovery inputs, not trusted official history.

The current server validates event shape before storing an event: event type, sync status, `originDeviceId:eventId` event IDs, ISO 8601 timestamps, matching `event.chatId`/`payload.chatId`, required IDs, message text length, and direct-chat pair-key consistency. The projection layer then checks business rules such as chat membership and group-owner changes.

A production version would go further with real authentication, per-action authorisation, registered device keys, signed events, and optional encrypted recovery dumps. If a user edited IndexedDB or changed a dump file, the modified event should be rejected unless it has a valid signature and passes server-side checks.

## Known Limits

- Demo authentication only.
- SQLite is used for simplicity and local runnability.
- Helper discovery is manual.
- WebRTC requires peers to be signaled before the outage; the central/helper peer directory helps prepare those links while users are connected.
- Manual QR/code signaling is future work.
- Production security, signed device events, access control, and encryption would need more work.
- REST sync and recovery import are demo-trusted replication paths.

## Why This Matters

Most chat demos assume the server is available. This project starts from a different assumption: people may still need to write messages while the central connection is unstable.

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
