# Architecture

## Summary

Durable Chat Relay is a central first chat system with optional helper nodes and browser side durability.

The original project provides the browser, helper and original Node central implementation. The Laravel central server is a separate project that can replace the original Node central in the helper sync path.

## Two supported central paths

### Original Node central path

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

Use:

```bash
npm run dev
```

### Laravel central integration path

```txt
Vue client :1234
   |
   | Socket.IO and helper API
   v
Node helper :3001
   |
   | signed HTTP sync
   v
Laravel central :8000
   |
   v
PostgreSQL
```

Use:

```bash
npm run dev:laravel
```

## Runtime modes

### Central mode

The Node process runs as the original central server.

```txt
NODE_ROLE=central
```

It accepts browser Socket.IO events and signed helper sync events.

### Helper mode

The Node process runs as the local helper.

```txt
NODE_ROLE=helper
```

The helper accepts browser Socket.IO connections, stores events in helper SQLite, pushes pending events to central, and pulls missed central events by cursor.

### Browser local mode

The browser stores user actions in IndexedDB when no transport path is available.

```txt
Browser -> IndexedDB outbox + cached users/chats/messages
```

### Peer assisted mode

Known browsers can replicate events over WebRTC data channels after Socket.IO signalling has established the peer link.

```txt
Browser <-> Browser
Each browser stores event log in IndexedDB
```

WebRTC does not replace the central server. It only helps active known peers exchange events during temporary connectivity gaps.

## Helper to central sync

The helper sync loop has two parts:

```txt
push pending local/helper events to central
pull missed central events since stored sequence cursor
```

Both push and pull requests are HMAC signed.

```txt
X-DCR-Helper-Id
X-DCR-Timestamp
X-DCR-Signature
```

The original Node central and Laravel central verify the same signature contract.

## Cursor rule

The helper stores the `latestSequence` returned by central.

Central must return:

```txt
latestSequence = sequence of the last event included in this response
currentSequence = current central maximum sequence
hasMore = latestSequence < currentSequence
```

This prevents a helper from skipping events when there are more central events than one response limit.

## Direct chat reconciliation

Direct chats use a canonical pair key based on sorted participant ids.

```txt
u-anna:u-denis
```

If several helpers create the same direct chat while offline, the central server is authoritative. The later helper receives the canonical central `chat.created` event and remaps its local duplicate chat id to the central one.

Expected result:

```txt
one central direct chat
helper SQLite remapped to central chat id
pending helper messages rewritten to central chat id
browser IndexedDB and UI reconciled to central chat id
```

This behaviour is expected with both central implementations.

## Responsibility split

| Concern | Original project | Laravel central project |
|---|---|---|
| Vue UI | yes | no |
| Socket.IO client transport | yes | no |
| Node helper mode | yes | no |
| Browser IndexedDB recovery | yes | no |
| WebRTC peer fallback | yes | no |
| Original Node central | yes | no |
| Laravel central HTTP API | no | yes |
| PostgreSQL central event store | no | yes |
| PHP 8.x OOP domain layer | no | yes |

## Security boundary

The project now signs helper sync requests to central. That protects helper to central sync traffic in the demo integration.

The project still uses demo user switching for browser sessions. A production system would need real authentication, per action authorization, signed device events, message encryption, key rotation, rate limiting and observability.
