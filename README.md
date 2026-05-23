# Durable Chat Relay

A resilience prototype for field teams who need chat actions to survive unreliable connectivity.

The project shows how a browser client, local helper node and central server can keep events recoverable during outages, then reconcile official history through signed, idempotent sync.

The main demo is simple: users keep sending messages through a helper while the central server is unavailable. When central returns, the helper syncs pending events, duplicates are ignored, and all clients converge on one chat history.

This project is a rethinking of an older chat system I built while self-employed from Feb 2021 to Feb 2022. The original project used a Vue chat widget, a Node.js Socket.IO gateway, service-worker notifications, and a separate persistence backend. This version keeps the useful idea behind that work, then rebuilds it as a clearer modern architecture.

This is a resilience prototype, not a production-secure messaging platform. It uses demo user switching so the focus stays on event recovery, helper sync, browser storage, signed helper-to-central communication, and peer fallback.

The project can run with its original Node.js central server, or with the separate Laravel 12 and PostgreSQL central server created as an additional backend implementation.

## One Map

```txt
Original standalone demo:
Vue client -> Node central -> SQLite

Helper resilience demo:
Vue client -> Node helper -> central authority

Laravel integration demo:
Vue client -> Node helper -> Laravel central -> PostgreSQL
```

The important split is:

```txt
local availability != central authority
```

The helper keeps local users working and queues events. Central later decides official history.

## Run A Demo

Standalone original path:

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:1234
```

```txt
Vue client :1234 -> Node central :3000 -> SQLite
```

Laravel central through helper:

```bash
# in the Laravel repository
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000
```

```bash
# in this repository
npm run dev:laravel
```

Open:

```txt
http://localhost:1234?api=http://localhost:3001
```

```txt
Vue client :1234 -> Node helper :3001 -> Laravel central :8000 -> PostgreSQL
```

For the actual walkthroughs, start with `docs/demo-guide.md`. It keeps the original Node central demo first, then the Laravel integration demos.

## Core Idea

The system is designed for organisations where field offices can appear and close several times per month. Installing a permanent server in every office is not realistic. Instead, the architecture has several layers of resilience.

### Central server available

Browser -> central Express/Socket.IO server -> central SQLite event store

When using the additional Laravel central server:

Browser -> local helper node -> Laravel central API -> PostgreSQL event store

### Central unavailable, helper available

Browser -> lightweight helper node on a responsible user's laptop  
Helper -> helper SQLite event store -> later signed central sync

### No central and no helper

Browser stores events in IndexedDB.  
Already-signalled browsers can replicate events to known peers through WebRTC.  
Peer fallback is limited to already-signalled active chat members.

### Recovery

Browser/helper uploads event logs to central.  
Central verifies signed helper sync where applicable.  
Central deduplicates events and rebuilds official history.

## What works in this project

- Vue 3 + TypeScript frontend
- Express and Socket.IO server
- Node central mode for the original demo path
- Node helper mode for the Laravel integration path
- SQLite persistence with `better-sqlite3`
- Event based chat model
- Browser IndexedDB outbox using Dexie
- Cached users, chats and messages for browser reopening
- Automatic pending event retry when Socket.IO reconnects
- Recovery dump export/import with client side validation
- Service worker notification path and notification click chat opening
- Canonical direct chat pair keys to prevent duplicate 1:1 chats
- WebRTC data channel replication between already signalled chat peers
- Peer directory for active shared chat peers, including local only tabs
- Helper sync push/pull with exponential backoff
- HMAC signed helper sync requests to central servers
- Direct chat remapping when several helpers create the same direct chat offline

## Security scope

This prototype includes helper to central request signing for sync traffic, but it does not include full production user authentication, per chat authorization, signed browser events, message encryption or production key management.

## Quick start: original Node central path

Use this when testing the original project by itself:

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:1234
```

This starts:

```txt
Vue client :1234 -> Node central :3000 -> SQLite
```

## Quick start: Laravel central integration path

Start the Laravel central server in the Laravel repository:

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000
```

Then start the helper and client in this repository:

```bash
npm install
npm run dev:laravel
```

Open:

```txt
http://localhost:1234?api=http://localhost:3001
```

This starts:

```txt
Vue client :1234 -> Node helper :3001 -> Laravel central :8000 -> PostgreSQL
```

Do not point the Vue app directly at `http://127.0.0.1:8000`. Laravel does not host the Socket.IO endpoint used by the client.

## Helper and central commands

| Command | Purpose |
|---|---|
| `npm run dev` | original Node central + Vue client |
| `npm run dev:central` | original Node central only |
| `npm run dev:helper` | helper connected to original Node central on `:3000` |
| `npm run helper:laravel` | helper connected to Laravel central on `:8000` |
| `npm run dev:laravel` | helper connected to Laravel + Vue client |
| `npm run dev:client` | Vue client only |
| `npm run reset:demo` | reset demo state helper script |

## Helper to central authorization

Helper sync requests are signed with HMAC SHA 256.

Local demo values:

```env
DCR_HELPER_SHARED_SECRET=local-dev-helper-secret
DCR_TRUSTED_HELPER_IDS=helper-demo
DCR_HELPER_SIGNATURE_TOLERANCE_SECONDS=300
```

The same signing contract works with:

```txt
Node helper -> original Node central
Node helper -> Laravel central
```

## Integration behaviour to check

The important integration behaviours are:

- helper pushes pending events with a valid signature
- central rejects unsigned helper sync requests
- helper pulls missed events with `since` and `limit`
- pull cursor advances to the last returned sequence, not the database maximum
- duplicate event retry does not create duplicate projections
- several helpers creating the same direct chat reconcile to one central chat id
- pending messages for the losing local chat id are rewritten before retry

## Documentation

- `docs/shared-integration-contract.md` is duplicated in both repositories and defines the integration contract.
- `docs/architecture.md` explains the original project architecture and how Laravel fits.
- `docs/helper-node.md` explains helper mode.
- `docs/helper-central-auth.md` explains signed helper sync.
- `docs/demo-guide.md` shows both demo paths.
- `docs/flows/` contains user and resilience flows.
- `docs/project-positioning.md` explains project scope and limits.

## Local verification

```bash
npm install
npm run typecheck
npm run test
```

For the Laravel integration path, also run the Laravel server and test through `npm run dev:laravel`.


## SHA-256 recovery checksum

Recovery exports include a SHA-256 checksum calculated from the canonical events payload. Recovery import verifies this checksum before accepting or previewing events, so truncated or manually corrupted dumps are rejected instead of being applied silently.
