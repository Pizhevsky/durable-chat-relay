# Resilience And Failure Flows

## Local only demo mode

1. User clicks **Simulate local-only tab**.
2. The current tab stops using normal chat delivery.
3. User actions are still saved to IndexedDB.
4. UI shows pending events.
5. User reconnects the tab.
6. Pending events retry automatically.

Local only means:

```txt
safe in this browser
not guaranteed delivered to everyone
may be visible to already connected WebRTC peers
the current Node server path sees it only after reconnect
Laravel sees it only after helper sync
```

## Helper available, central unavailable

1. Helper runs with `NODE_ROLE=helper`.
2. Users connect to helper URL.
3. Helper stores events in helper SQLite.
4. Helper broadcasts events to users connected to that helper.
5. Central is unavailable, so push/pull sync fails.
6. Helper backs off and keeps retrying.
7. Central returns.
8. Helper signs sync requests and sends pending events.

With Laravel central, this means Laravel `:8000` may be down while the Node helper `:3001` continues serving the Vue client. The browser remains connected to the helper, not to Laravel.

Result:

```txt
local team can keep working through helper
central becomes consistent when helper sync succeeds
```

## Helper restart

1. Helper process restarts.
2. Helper uses the same SQLite file.
3. Pending helper events remain stored.
4. Helper resumes push/pull sync when it starts.

Result:

```txt
helper restart should not delete helper stored chats
data is lost only if the helper database file is removed or changed
```

## Duplicate direct chat across several helpers

Scenario:

```txt
Helper A creates direct chat chat-a for Denis and Anna while central is unavailable.
Helper B creates direct chat chat-b for Denis and Anna while central is unavailable.
Central returns.
Helper A syncs first.
Helper B syncs later.
```

Expected behaviour:

```txt
central accepts one direct chat as canonical
central returns the canonical chat.created event to the later helper
later helper remaps its local duplicate chat id to the central chat id
pending local messages are rewritten to the central chat id
browser state reconciles when it receives the authoritative central event
```

This is expected with both central implementations:

```txt
original Node central
Laravel central
```

## WebRTC peer fallback

1. Users are connected long enough for Socket.IO signalling.
2. Server relays peer signals only between users who share an active chat.
3. Browsers establish a WebRTC data channel.
4. Later, the tab may lose its Socket.IO transport to the current Node server path.
5. Browser publishes events to peer channels for target chat members only.
6. Receiver validates that it knows the chat and is an active member before saving.
7. Receiver ACKs stored events over the peer channel.
8. If the receiver is connected to the Node server path, it syncs the original event without rewriting the sender. In Laravel mode, that sync reaches Laravel through the helper.

What WebRTC does not do:

```txt
it does not discover users who were never online
it does not wake closed browsers
it does not send Denis-Anna messages to unrelated users
it does not replace central conflict resolution
```

## Conflict during sync

1. Browser sends events through Socket.IO, or helper sends a signed HTTP sync batch.
2. Central applies valid events.
3. Central rejects invalid projection events as conflicts.
4. Sync response lists accepted, duplicate and conflicted events.

Examples:

```txt
message for missing chat
member change by non-owner
direct chat with invalid member count
invalid helper signature
```

Current behaviour:

```txt
conflicts are surfaced as failed events or errors
production recovery would need user facing conflict repair tools
```
