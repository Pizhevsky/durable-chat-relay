# Messaging And Sync Flows

## Create direct chat online

1. User selects another user.
2. Browser creates a `chat.created` event with a direct pair key.
3. Event is saved locally first.
4. Browser sends the event through Socket.IO to the current server path.
5. In original direct mode, Node central stores the event and projects the chat.
6. In Laravel integration mode, the Node helper stores and broadcasts locally, then syncs the event to Laravel over signed HTTP.
7. The current server path returns or broadcasts the accepted event.
8. Browser marks the local event as synced for the path it used.

Duplicate protection:

```txt
direct chats use a canonical pair key like u-anna:u-denis
central returns the existing chat event instead of creating a second direct chat
```

## Send message online

1. User writes a message and presses send.
2. Browser creates `message.created`.
3. Browser saves the event in IndexedDB before network delivery.
4. Socket.IO sends the event to the current server path.
5. Server confirms and broadcasts to active chat members.
6. In helper mode, central confirmation happens later through helper sync.
7. Receivers apply the event and cache updated chat/messages.

Expected UI:

```txt
message appears immediately for sender
receiver sees it in realtime if connected
unread count increments for receivers who have not opened the chat
```

## Helper sync to central

When the browser talks to a helper, the helper becomes the local relay and central sync client.

1. Helper stores local events in helper SQLite.
2. Helper signs `POST /api/sync/events` with HMAC headers.
3. Central validates the helper signature.
4. Central accepts, duplicates or rejects events.
5. Helper marks accepted and duplicate events as central synced.
6. Helper applies any authoritative `serverEvents` returned by central.
7. Helper signs `GET /api/sync/events?since=...&limit=...`.
8. Helper applies missed central events and stores `latestSequence` as cursor.

This flow works with both central implementations:

```txt
original Node central
Laravel central
```

In the Laravel path, the browser never sends Socket.IO or HMAC requests to Laravel directly. The browser talks to the Node helper; the helper talks to Laravel.

## Cursor rule

Central response:

```txt
latestSequence = last returned event sequence
currentSequence = current central maximum sequence
hasMore = latestSequence < currentSequence
```

The helper stores `latestSequence`, not `currentSequence`. This prevents skipped events when the central response is paged.

## Automatic pending retry

1. Browser or helper has pending, failed, helper synced or peer replicated events.
2. Transport reconnects or helper sync loop runs.
3. Events are sent in created time order.
4. Central accepts, deduplicates or reports conflict.
5. Local state is updated from the response.

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

## Read receipts

1. User opens a chat.
2. App finds messages not sent by current user and not read by current user.
3. App creates `message.read` events.
4. Events follow the same local save and network send path.
5. UI displays reader names, excluding the current user.

## Chat list projection

1. Server stores immutable events.
2. Server projects current chat rows, members, messages and read rows.
3. Browser receives chat list and active messages.
4. Browser caches visible state in IndexedDB.

Why this matters:

```txt
retry, import, peer relay and helper sync can send the same event more than once
event idempotency keeps projections stable
```
