# Architecture Notes

## Summary

Durable Chat Relay is a central-first chat system with optional helper nodes and browser-side durability.

The architecture was shaped by a real field-office constraint: offices may appear and disappear frequently, so permanent local servers are not always practical. At the same time, relying only on a central server is risky when field connectivity is unstable.

This is resilience architecture, not secure enterprise messaging. The architecture can be connected to real authentication and authorisation, but this implementation uses demo user switching and demo-auth headers.

## Modes

### Central mode

Users connect directly to the central Express/Socket.IO server.

```txt
Browser -> central server -> central SQLite database
```

### Helper mode

A responsible area user can run a lightweight helper process on a laptop.

```txt
Browser -> helper node -> helper SQLite database
Helper node -> central server when available
```

### Browser-only mode

The browser stores user actions in IndexedDB until a transport becomes available.

```txt
Browser -> IndexedDB outbox + cached users/chats/messages
```

### Peer-assisted mode

Known browsers replicate events over WebRTC data channels after central/helper signaling has established the peer link.

```txt
Browser <-> Browser <-> Browser
Each browser stores event log in IndexedDB
```

Socket.IO carries WebRTC offers, answers and ICE candidates. The server derives `fromUserId` and `fromDeviceId` from the authenticated socket session, sends each browser a peer directory of online/local-only users who share active chats, and only relays `peer:signal` to those shared-chat peers.


## Peer directory preparation

A WebRTC fallback only helps if peers know about each other before the central path becomes unstable. When a browser connects, changes user, creates a chat, changes membership, or switches into local-only mode, the server recalculates a peer directory for each connected user.

The directory includes online or local-only users who share an active chat with the current user. The client uses that directory to prepare peer connections even if the user is not currently looking at that chat. This avoids a failure mode where Denis had a peer link to Anna, Anna later prepared a link to Kate, but Kate could not reach Denis for a group message because Kate never learned Denis was an available shared-chat peer.

The directory is still scoped by chat membership. It is not a global list of every online user, and it does not allow signaling to unrelated users.

## Why event log

Rows alone are not enough for durable retry. The same message can arrive via the original browser, helper sync, peer replication or recovery dump.

An event log gives one stable identity per action:

```txt
eventId = originDeviceId + uuid
```

The central server can accept the first copy and ignore duplicates.

## Helper node philosophy

The helper is intentionally small.

It is not a full branch server. It is a temporary cache, relay and sync queue that can be started where it helps and ignored where it is not available. It pushes local events to central, pulls missed central events with a stored sequence cursor, and backs off while the central server is unavailable.


## Demo visibility

For portfolio and interview demos, the app includes a local-only simulation mode. It pauses central/helper chat delivery for the current browser tab while keeping the socket available for peer directory updates and WebRTC signaling. This makes it easy to show the recovery path on one computer:

```txt
connected -> local-only tab -> IndexedDB outbox -> reconnect -> automatic retry -> central-synced
```

The UI also shows recent events, pending counts, notification permission state and message sync status so the underlying process is visible rather than hidden behind the chat interface.

## Duplicate direct-chat protection

Direct chats use a canonical pair key based on sorted participant IDs. This prevents accidental duplicate direct chats when events are retried, imported from a recovery dump, or later arrive from a helper node.

## Trust boundaries

This is a demo app, not production authentication. Socket sessions trust the demo `client:hello` user selection, and REST event publishing still uses a demo user header.

The REST sync and recovery endpoints are also intentionally demo-trusted:

- `POST /api/sync/events` accepts replicated events and preserves their original `actorUserId`.
- `POST /api/recovery/import` imports event dumps and also preserves original authorship.

That matches the helper/browser recovery story, but it is not a production trust model. Peer signaling is constrained to active shared-chat members, but production deployments would still need real authentication, authorisation checks, signed events and stricter validation of REST sync, recovery import and WebRTC signaling payloads.
