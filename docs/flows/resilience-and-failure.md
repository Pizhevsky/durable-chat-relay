# Resilience And Failure Flows

## Local-Only Demo Mode

1. User clicks **Simulate local-only tab**.
2. The current tab stops using Socket.IO delivery.
3. User actions are still saved to IndexedDB.
4. UI shows pending events.
5. User can reconnect the tab.
6. Pending events are retried automatically.

What local-only means:

- safe in this browser
- not guaranteed delivered to everyone
- may be visible to already-connected WebRTC peers
- central/helper sees it only after reconnect
- same-browser local broadcasts are scoped to the same selected demo user, not
  used as cross-user delivery

## Sender Local-Only, Receiver Online

1. Denis enters local-only mode.
2. Anna is online through central.
3. Denis sends a message.
4. Denis sees it locally.
5. Central does not receive it yet.
6. Anna receives it only if an existing WebRTC channel from Denis to Anna is open.
7. If Anna is connected, she uploads Denis' original event to central.
8. Otherwise Anna sees it after Denis reconnects and syncs.

## Sender Local-Only, Receiver Closed

1. Denis enters local-only mode.
2. Anna's browser is closed.
3. Denis sends messages.
4. Denis closes browser before reconnecting.
5. Messages remain only in Denis' browser IndexedDB.
6. Anna sees nothing.
7. Denis opens the same browser later.
8. App reconnects and syncs.
9. Anna sees the messages after central/helper receives them.

Key expectation:

The saved local history belongs to the browser that created it. Other users cannot pull it from a closed browser.

## Helper Node Available

1. Helper node runs with `NODE_ROLE=helper`.
2. Users connect to helper URL.
3. Helper stores events in helper SQLite.
4. Helper broadcasts events to users connected to that helper.
5. Helper periodically pushes pending events to central.
6. Helper pulls missed central events using a stored sequence cursor.
7. Helper backs off when central is unavailable.

Result:

- the local team can keep working through helper
- central becomes consistent when helper sync succeeds

## Helper Node Restart

1. Helper process restarts.
2. Helper uses the same SQLite file.
3. Pending helper events remain stored.
4. Helper resumes push/pull sync when it starts.

Result:

- helper restart should not delete helper-stored chats
- data is lost only if the helper database file is removed or changed

## WebRTC Peer Fallback

1. Users are connected long enough for Socket.IO signaling.
2. Server relays `peer:signal` only between users who share an active chat.
3. Browsers establish a WebRTC data channel.
4. Later, central/helper transport may fail for a tab.
5. Browser publishes events to peer channels for target chat members only.
6. Receiver validates that it knows the chat and is an active member before saving.
7. Receiver ACKs stored events over the peer channel.
8. If the receiver is connected, it syncs the original event to central/helper
   without rewriting the sender.
9. When a peer channel opens, both sides exchange event summaries.
10. Each peer requests missing event IDs and receives missing events in batches.
11. Peer-replicated events remain retryable until central confirmation.

What WebRTC does not do:

- it does not discover users who were never online
- it does not wake closed browsers
- it does not send Denis-Anna messages to Mark
- it does not use the one-computer `BroadcastChannel` as cross-user delivery
- it does not replace central conflict resolution

## Duplicate Direct Chat Offline

1. Denis creates a direct chat with Anna offline.
2. Anna also creates a direct chat with Denis offline.
3. Each browser has a different local chat id.
4. Central later receives one chat first.
5. Central accepts it and stores the canonical direct pair key.
6. Central later receives the second chat.
7. Central returns the existing accepted chat event.
8. Client remaps local pending events from the losing local chat id to the accepted central chat id.

Result:

- users end with one direct chat
- pending messages follow the surviving chat id

Helper-node edge:

If a helper node creates local direct chat A while central already has direct chat B
for the same pair, central returns B as the canonical chat. Browser-side retry
already remaps pending events to B. A full helper-local remap would also rewrite
helper SQLite rows for A, then project the official central chat event B without
duplicating the helper's local projection. That is a documented hardening item
rather than demo authentication logic.

## Conflict During Sync

1. Browser/helper sends a batch of events.
2. Server applies valid events.
3. Server rejects invalid projection events as conflicts.
4. Sync response lists accepted, duplicate and conflicted event ids.

Examples:

- message for missing chat
- member change by non-owner
- direct chat with invalid member count

Current demo behavior:

- conflicts are surfaced as failed events or errors
- production recovery would need user-facing conflict repair tools
