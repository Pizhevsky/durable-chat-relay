# Demo Guide

The project is designed so you can demonstrate the architecture from one laptop.
The demo has two levels:

- **Fast dev demo**: normal realtime chat, direct-chat deduplication,
  browser local-only mode, IndexedDB outbox, automatic retry, notifications,
  and event-flow visibility.
- **Helper-node demo**: central and helper nodes running at the same time,
  each with its own SQLite event store, with helper events syncing back to
  central.

## Start Clean

Optional, but useful when recording a demo:

```bash
mkdir -p data
rm -f data/*.sqlite data/*.sqlite-wal data/*.sqlite-shm
```

Then install and run checks once:

```bash
npm install
npm run typecheck
npm run test
```

## Normal Central Chat

Run the normal development setup:

```bash
npm run dev
```

Open:

```txt
http://localhost:1234
```

Demo steps:

1. Select **Denis** as the current demo user.
2. Click **Open Anna window**.
3. In Denis' window, choose Anna and click **Open/create direct chat**.
4. Send a message from Denis.
5. Reply from Anna.
6. Watch **Recent event flow**, unread badges, and read status.

What to point out:

| Visible behaviour | Technical activity |
|---|---|
| Message appears in the other window immediately | Socket.IO publishes an event to the chat room. |
| Message remains after refresh | SQLite stores the event and projected read model. |
| Recent event flow updates | The UI shows the event stream, not only final CRUD state. |
| Unread badge changes | `message.read` projection is working. |
| Connection label says central | Browser is connected to the central node. |

## Direct-Chat Duplicate Prevention

Demo steps:

1. In Denis' window, click **Open/create direct chat** with Anna again.
2. In Anna's window, try to open/create a direct chat with Denis.
3. Look at the chat row showing the pair key.

What to point out:

| Visible behaviour | Technical activity |
|---|---|
| A second 1:1 chat is not created | Pair key is canonical and sorted by user ID. |
| Pair key stays stable | Retry, helper sync, and recovery import cannot create duplicates. |
| Existing chat opens instead | Client lookup and SQLite uniqueness protect the invariant. |

## Browser Outage And IndexedDB

This is the most important one-computer resilience demo.

Demo steps:

1. In Denis' tab, click **Simulate local-only tab**.
2. Send one or two messages.
3. Watch the pending-event counter increase.
4. Refresh Denis' tab while still in local-only mode.
5. Click **Reconnect this tab**.
6. Watch pending events flush automatically.
7. Confirm Anna receives the messages.

The demo-local-only flag is kept in `sessionStorage`, so this tab stays
disconnected after refresh until **Reconnect this tab** is clicked.

If Anna sees a Denis message before Denis reconnects, that should be because
the hero panel reports a real peer send, for example `Peer fallback: sent to 1
peer`. Cross-user demo windows do not receive local-only messages through the
same-browser local event bus.

What to point out:

| Visible behaviour | Technical activity |
|---|---|
| Message appears locally while disconnected | Event is saved to IndexedDB before network delivery. |
| Pending counter increases | Local outbox has events not central-confirmed yet. |
| Reconnect sends automatically | Socket reconnect calls the outbox retry path. |
| Messages reach Anna after reconnect | Pending events are accepted and broadcast by central. |
| Pending counter returns to zero | IndexedDB events move to `sent-to-central`. |

Suggested explanation:

> Socket.IO is the live transport, but the browser stores user intent first.
> If the connection drops or the tab is closed, the user action can still be
> restored and retried later.

## Notification Bridge

Demo steps:

1. Click **Allow notifications**.
2. Click **Test notification** to confirm browser permission works.
3. Put Anna's window in the background or use another tab.
4. Send a message to Anna from Denis.
5. Click the notification.

What to point out:

| Visible behaviour | Technical activity |
|---|---|
| Browser notification appears | Vue posts a foreground notification through the worker. |
| Notification click focuses/opens app | Worker sends `OPEN_CHAT` or opens URL with `?chat=...`. |
| Chat opens after click | Browser notification state links back to Vue state. |

## Recovery Dump

Demo steps:

1. In local-only mode, create one pending message.
2. Click **Export recovery dump**.
3. Save the JSON file.
4. Optional: import it back with the file input.
5. Reconnect and allow sync.

What to point out:

| Visible behaviour | Technical activity |
|---|---|
| JSON recovery file downloads | IndexedDB events are serialized with a versioned format. |
| Import rejects wrong files | Client validates recovery dump format. |
| Imported events deduplicate | Central stores each event once by `eventId`. |

## Helper-Node Demo

This demo can use either production build mode or the Parcel dev UI API override.

Build once:

```bash
npm run build
```

Terminal 1:

```bash
NODE_ROLE=central \
NODE_ID=central-demo \
PORT=3000 \
DATABASE_PATH=./data/central.sqlite \
npm run start
```

Terminal 2:

```bash
NODE_ROLE=helper \
NODE_ID=helper-demo \
PORT=3001 \
DATABASE_PATH=./data/helper.sqlite \
CENTRAL_URL=http://localhost:3000 \
HELPER_SYNC_INTERVAL_MS=3000 \
npm run start
```

Open both:

```txt
Central UI: http://localhost:3000
Helper UI:  http://localhost:3001
```

Or keep the Parcel dev client open and point it at the helper API:

```txt
http://localhost:1234?api=http://localhost:3001
```

Demo steps:

1. In the helper UI, open two users in two windows.
2. Create a direct chat or group and send messages.
3. Watch the helper connection label.
4. Keep central running and wait for the helper sync interval.
5. Open the central UI and refresh chats.
6. Confirm helper-created events are visible centrally.

What to point out:

| Visible behaviour | Technical activity |
|---|---|
| Helper UI works separately | Helper is its own Express/Socket.IO node. |
| Helper stores messages locally | Events are written to helper SQLite first. |
| Central later receives events | Helper push sync sends unsynced events to central. |
| Helper can pull central events | Helper has a central sequence cursor. |
| Sync backs off on failure | Helper retries without tight-looping. |

## Peer Fallback

After the working demo, explain the WebRTC layer and open
[webrtc-peer-mode.md](webrtc-peer-mode.md) for protocol details.

What to point out:

| Capability | Technical meaning |
|---|---|
| `peer:signal` | Socket.IO exchanges offers, answers, and ICE candidates. |
| `event:new` | Browser sends a chat event over a WebRTC data channel. |
| Peer storage | Receiver stores peer events as `peer-replicated`. |
| Central reconciliation | Central deduplicates browser/helper/peer uploads by `eventId`. |
| Peer recovery | Peers ACK, exchange summaries, and request missing events. |
| UI status | Hero panel shows peer status, ACK count, and last peer event. |

Suggested explanation:

> The current project implements peer-assisted recovery, not magic LAN
> discovery. Browsers need central or helper signaling first. Once a WebRTC data
> channel exists, local-only tabs can exchange new events, compare event
> summaries, backfill missing events, and later reconcile with central.

Useful status checks:

```txt
Peer fallback: connected to Anna
Peer fallback: sent to 1 peer
Peer fallback: no open peer channel
```

The last line means the message is still safe in IndexedDB, but it will not be
visible to the other user until reconnect/helper sync/recovery import.