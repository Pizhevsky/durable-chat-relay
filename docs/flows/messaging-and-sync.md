# Messaging And Sync Flows

## Create Direct Chat Online

1. User selects another user.
2. Browser creates a `chat.created` event with a direct pair key.
3. Event is saved locally first.
4. Browser sends the event through Socket.IO.
5. Server trusts the socket session actor, stores the event, and projects the chat.
6. Server broadcasts the event to active chat members.
7. Browser marks the local event as central-synced.

Duplicate protection:

- direct chats use a canonical pair key like `u-anna:u-denis`
- central returns the existing chat event instead of creating a second direct chat

## Create Group Chat Online

1. User enters a group title and selects members.
2. Browser creates a `chat.created` group event.
3. Creator becomes owner.
4. Server stores the chat and member rows.
5. Server broadcasts to active members.
6. Offline members see the group after reconnecting.

Current rule:

- membership changes are validated by server ownership checks

## Send Message Online

1. User writes message and presses send.
2. Browser creates `message.created`.
3. Browser saves the event in IndexedDB before network delivery.
4. Socket.IO sends the event to server.
5. Server confirms and broadcasts to active chat members.
6. Sender marks event as central-synced.
7. Receivers apply the event and cache updated chat/messages.

Expected UI:

- message appears immediately for sender
- receiver sees it in realtime if connected
- unread count increments for receivers who have not opened the chat

## Send Message While Disconnected

1. User sends message without central/helper transport.
2. Browser saves event in IndexedDB.
3. Message appears locally with non-central status.
4. If peer channel exists, browser can replicate to target chat peers.
5. Event stays retryable until central/helper confirms it.

Result:

- sender can keep working
- not connected receivers do not see it yet
- central history updates only after a later sync

## Automatic Pending Retry

1. Browser has pending, failed, helper-synced, or peer-replicated events in IndexedDB.
2. Socket.IO connects or reconnects.
3. App calls `retryPending()`.
4. Events are sent in created-time order.
5. Server accepts, deduplicates, or reports conflict.
6. Browser updates local event status.

Retryable local statuses:

```txt
pending
failed
sent-to-helper
peer-replicated
```

Finished local status:

```txt
sent-to-central
```

## IndexedDB Retention After Sync

The browser does not wipe IndexedDB after every sync. It uses a bounded retention policy:

1. Retryable events stay until central confirms them.
2. Cached users, chats and messages stay so refresh/reopen can still work.
3. Central-synced event records are retained for recent peer recovery and debugging.
4. Stale central-synced events are pruned after the retention window.
5. Peer ACKs for deleted events are pruned as orphans.

Current defaults:

```txt
keep central-synced events for 24 hours
always keep at least the newest 200 central-synced events
```

This keeps storage bounded without deleting unsynced work or breaking recent peer backfill.

## Read Receipts

1. User opens a chat.
2. App finds messages not sent by current user and not read by current user.
3. App creates `message.read` events.
4. Events follow the same local-save and network-send path.
5. UI displays reader names, excluding the current user.

Examples:

```txt
read by Anna
read by Denis, Kate
not read yet
```

## Chat List Projection

1. Server stores immutable events.
2. Server projects current chat rows, members, messages and read rows.
3. Browser receives `chat:list` and active messages.
4. Browser caches visible state in IndexedDB.

Why this matters:

- retry/import/peer/helper can send the same event more than once
- event idempotency keeps projections stable
