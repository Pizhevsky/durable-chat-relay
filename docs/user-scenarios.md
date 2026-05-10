# User Scenarios

This document describes the app from the user experience side: what each person sees, what is saved, who receives messages, and what happens when the environment changes.

## Actors

The demo users are Denis, Anna, Mark, Kate and Ivan. Any user can open the app in a separate browser window. The selected current user is stored per URL/user selection.

## Scenario Matrix

| Environment | Sender experience | Receiver experience | Storage path | When everyone becomes consistent |
|---|---|---|---|---|
| Central online | Message sends and appears normally | Online chat members receive it immediately | Central SQLite event store plus browser cache | Immediately after server accepts the event |
| Sender local-only, receivers online | Sender sees the message locally with pending state | Receivers do not receive it from central until sender reconnects; already-connected WebRTC peers may receive peer replication | Sender IndexedDB outbox; optionally peer IndexedDB | After sender reconnects and pending events sync |
| Sender local-only, receivers offline | Sender sees saved local history | Receivers see nothing yet | Sender IndexedDB only | After sender opens app again and syncs to central/helper |
| Helper available, central unavailable | User works through helper URL | Other helper-connected users receive messages | Helper SQLite, later central SQLite | After helper syncs with central |
| Peer link already established | User can send while central/helper path is interrupted | Target chat members with open peer channels can receive replicated events | Browser IndexedDB on sender and peer | After any replicated browser syncs to central |
| Browser refreshed or reopened | Cached chats/messages can reopen | No new data appears until transport returns | Browser IndexedDB cache/outbox | After central/helper/WebRTC sync catches up |
| Recovery dump exported | User can preserve unsynced events in a JSON file | No automatic receiver change | Downloaded recovery file | After import into central/helper/browser and deduplication |

## Normal Central Chat

1. Denis opens the app and is connected to the central server.
2. Denis creates a direct chat with Anna or selects an existing chat.
3. Denis sends a message.
4. The browser saves intent locally, sends the event through Socket.IO, and central stores it.
5. Anna receives the event immediately if her window is online.
6. Both users see the message after refresh because central has the official event log.

Expected UI:

- connection label says connected to central
- pending local events returns to `0`
- message status becomes `central-synced`
- unread/read indicators update from `message.read` events

## Sender Uses Local-Only Mode

1. Denis clicks **Simulate local-only tab**.
2. Denis sends messages.
3. Denis sees the messages locally because they are applied in his tab and saved in IndexedDB.
4. The central server does not receive those events yet.
5. Users who are not connected through an existing peer channel do not see the messages yet.
6. Denis clicks **Reconnect this tab**.
7. The outbox retries pending events and central accepts them.
8. Online receivers get the official events; offline receivers see them later after refresh/reconnect.

Important user expectation:

Local saved means “safe on this browser,” not “delivered to everyone.” If Denis closes the browser before reconnecting, the only copy may be in Denis’ IndexedDB until he opens the app again.

## Closing While Local-Only

1. Denis is in local-only mode with unsynced or locally saved messages.
2. Denis closes or refreshes the browser tab.
3. The browser shows a before-unload warning.
4. If Denis closes anyway, data remains in browser storage.
5. Anna, Mark or Kate will not receive that data until Denis opens the app and syncs.

Browser limitation:

Modern browsers usually show generic warning text, not the custom app message. The prompt still protects against accidental close.

## Receiver Offline

1. Denis sends a central-synced message while Anna is offline.
2. Central stores the event.
3. Anna sees nothing while her browser is closed.
4. When Anna opens the app, chat list/messages load from central.
5. The unread badge shows messages she has not read yet.

If Denis was local-only instead, Anna still sees nothing until Denis syncs.

## WebRTC Peer Fallback

1. Denis and Anna are online long enough for central/helper Socket.IO to exchange WebRTC signals.
2. A peer data channel opens between them.
3. Denis enters local-only mode or loses central/helper transport while the peer channel remains open.
4. Denis sends a message in a chat that includes Anna.
5. The event is sent only to peers who are active members of that event’s chat.
6. Anna validates that she knows the chat and is a member before saving the peer event.
7. Anna ACKs the stored event over the data channel.
8. When peers reconnect, they exchange event summaries and request missing event IDs.
9. Missing events are sent back as batches.
10. Anna can see the peer-replicated message before central sync.
11. Later, Denis or Anna syncs the event to central, and central deduplicates by `eventId`.

What WebRTC does not do:

- it does not magically discover offline users
- it does not wake closed browsers
- it does not send Denis-Anna chat events to Mark
- it does not replace central reconciliation
- it requires signaling while central or helper was reachable

## Helper Node Path

1. A responsible user starts a helper node on a laptop.
2. Nearby users open the helper URL.
3. Messages are stored in helper SQLite first.
4. Users connected to the helper receive realtime Socket.IO updates.
5. If central is unavailable, helper queues events.
6. When central returns, helper pushes pending events and pulls missed central events.
7. Central deduplicates events by `eventId`.

User-facing result:

The field team can keep working locally even if central is unstable, and the official central history catches up later.

## Duplicate Direct Chat During Offline Work

1. Denis creates a direct chat with Anna while offline.
2. Anna also creates a direct chat with Denis while offline.
3. Both local chats have different temporary chat IDs.
4. When they sync, central accepts the first direct chat.
5. The second direct chat is recognized by its canonical pair key, for example `u-anna:u-denis`.
6. Central returns the accepted chat creation event instead of creating a duplicate.
7. The client remaps the rejected local chat ID and pending messages to the accepted central chat ID.

User-facing result:

The users end up with one direct chat, and pending messages follow the surviving chat.

## Group Chat Creation

1. A user enters a group title and selects members.
2. The creator becomes owner.
3. The group is stored as a `chat.created` event.
4. Online members receive it through central/helper or WebRTC only if they are target members.
5. Members who were offline see it after reconnecting and loading from central/helper.

Current limitation:

Membership changes are centrally validated. Peer/local outage mode can carry events, but production-grade membership conflict rules would need stronger authorization and signed events.

## Read Receipts

1. A receiver opens a chat.
2. The app creates `message.read` events for unread messages from other users.
3. Message metadata shows names, not counts, and excludes the current user.
4. If offline/local-only, read events may be pending until reconnect.

Examples:

```txt
read by Anna
read by Denis, Kate
not read yet
```

## Notifications

1. User grants browser notification permission.
2. If the app is hidden and receives an incoming message for one of the user’s chats, it can show a notification.
3. Clicking the notification opens or focuses the chat.
4. Messages for chats the user does not belong to are ignored and do not show notifications.

Limitations:

- browser permission rules apply
- test notification only proves the browser notification path works
- real backend Web Push requires configured VAPID keys

## Recovery Dump

1. User has unsynced browser events.
2. User exports a recovery dump.
3. The file contains local events with original authorship.
4. User or support imports it later.
5. Central/helper applies events idempotently and deduplicates by event ID.

Production caveat:

This demo preserves event authorship for recovery. A production system would require signed events or stronger trust boundaries.

## Trust And Security Boundaries

This project is a demo. It shows resilience mechanics, not secure enterprise messaging. The architecture can be connected to real authentication and authorization, but the current implementation uses demo user switching and demo-auth headers.

Current demo trust model:

- Socket sessions trust the selected demo user from `client:hello`.
- `POST /api/events` uses `x-demo-user-id`.
- `POST /api/sync/events` accepts replicated events and preserves original `actorUserId`.
- Recovery import preserves original event authorship.
- Peer signaling is limited to active shared-chat members.

Production requirements:

- real authentication
- authorization per chat/action
- signed or otherwise verifiable events
- stricter validation of sync/recovery payloads
- encrypted WebRTC and stored message payload policy

## Quick User Expectations

| User question | Honest answer |
|---|---|
| “If I send while local-only, is it safe?” | It is safe in this browser’s IndexedDB. |
| “Did everyone receive it?” | Only central/helper/peer-connected recipients. Offline users wait until sync. |
| “Can I close the browser?” | The app warns you. Data stays local, but others may not see it until you reopen and sync. |
| “Can WebRTC deliver to users who were never online?” | No. It needs already-established signaling/peer connection. |
| “Can duplicate direct chats happen?” | Local duplicates can happen offline, but central remaps by canonical pair key during sync. |
| “What if central receives the same event twice?” | It stores one copy by `eventId`. |
