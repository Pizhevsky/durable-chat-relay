# Durable Chat Relay

A chat prototype for field teams who need to keep working when connectivity becomes unreliable.

The main idea is simple: a browser or nearby helper can preserve chat actions while central is unavailable, then central later deduplicates events and rebuilds the official history. The implementation uses Vue 3, TypeScript, Express, Socket.IO, SQLite, IndexedDB recovery, helper-node sync, signed helper-to-central sync, and peer-assisted WebRTC fallback.

This project is a rethinking of an older chat system I built while self-employed from Feb 2021 to Feb 2022. The original project used a Vue chat widget, a Node.js Socket.IO gateway, service-worker notifications, and a separate persistence backend. This version keeps the useful idea behind that work, then rebuilds it as a clearer modern architecture.

This is a resilience prototype, not a production-secure messaging platform. It uses demo user switching so the focus stays on event recovery, helper sync, browser storage, signed helper-to-central communication, and peer fallback. It does not yet include real user authentication, per-chat authorization, signed browser events, message encryption, production deployment, or observability.

The project can run with its original Node.js central server, or with the separate Laravel 12 and PostgreSQL central server created as an additional backend implementation.

## Runtime map

| Mode | Runtime path | Use it for |
|---|---|---|
| Original direct mode | `Vue client -> Node central -> SQLite` | Fast standalone demo and original project behaviour. |
| Helper with Node central | `Vue client -> Node helper -> Node central -> SQLite` | Helper outage/retry demos without Laravel. |
| Helper with Laravel central | `Vue client -> Node helper -> Laravel central -> PostgreSQL` | PHP/PostgreSQL central integration demo. |

## Core idea

The system is designed for organisations where field offices can appear and close several times per month. Installing a permanent server in every office is not realistic. Instead, the architecture has several layers of resilience.

```txt
Central server available:
Browser -> central Express/Socket.IO server -> central SQLite event store

Central unavailable, helper available:
Browser -> lightweight helper node on a responsible user's laptop
Helper -> helper SQLite event store -> later signed central sync

No central and no helper:
Browser stores events in IndexedDB
Already-signalled browsers can replicate events to known peers through WebRTC

Recovery:
Browser/helper uploads event logs to central
Central deduplicates events and rebuilds official history
```

When using the additional Laravel central server, the browser still talks to the Node helper:

```txt
Vue client -> Node helper -> Laravel central API -> PostgreSQL
```

Laravel does not host the Socket.IO endpoint used by this client.

## What to look for

The most important behaviours are not the chat screens themselves. They are the recovery and convergence rules behind the screens:

- user actions are stored before the network path is trusted
- duplicate direct chats are prevented through a canonical pair key
- helper nodes can keep working while central is unavailable
- helper-to-central sync is signed with HMAC
- central stores each event once by `eventId`
- browser, helper and central paths can later reconcile the same history

## Run the main demos

Original standalone path:

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:1234
```

Laravel central integration path:

```bash
# in the Laravel repository
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000
```

```bash
# in this repository
npm install
npm run dev:laravel
```

Open:

```txt
http://localhost:1234?api=http://localhost:3001
```

For the walkthrough, use [`docs/demo-guide.md`](docs/demo-guide.md).

## Documentation

- [`docs/demo-guide.md`](docs/demo-guide.md) shows the one-laptop demo flows.
- [`docs/architecture.md`](docs/architecture.md) explains the runtime paths and resilience layers.
- [`docs/flows/README.md`](docs/flows/README.md) documents the behaviour flows behind messaging, sync, recovery, notifications, and user switching.
- [`docs/oop-design.md`](docs/oop-design.md) explains the code structure and OOP boundaries.
- [`docs/helper-node.md`](docs/helper-node.md) explains helper responsibilities.
- [`docs/helper-central-auth.md`](docs/helper-central-auth.md) explains signed helper-to-central sync.
- [`docs/shared-integration-contract.md`](docs/shared-integration-contract.md) defines the contract shared with the Laravel central server.
- [`docs/webrtc-peer-mode.md`](docs/webrtc-peer-mode.md) explains peer-assisted recovery.

## Important boundaries

```txt
Original project owns:
Vue client, Socket.IO runtime, Node helper, browser IndexedDB recovery, peer-assisted WebRTC, original Node central demo.

Laravel project owns:
Optional central HTTP authority, PostgreSQL event store, PHP 8.x OOP implementation of the central sync contract.
```

Helper-to-central sync uses HMAC signed requests. The signing secret stays on the helper server and is not exposed to the Vue browser client. Browser user switching is only for the demo and is not production authentication.
