# WebRTC Peer Mode

The project includes practical WebRTC peer recovery for already-known users.

The current implementation uses Socket.IO as signaling and WebRTC data channels
as an event transport. This allows known users to keep exchanging and recovering
chat events if peer connections were established before the outage.

## Goal

```txt
Central unavailable
Helper unavailable
Known browsers still exchange events directly
Each browser stores events in IndexedDB
Central server reconciles later
```

## Current Behavior

Implemented now:

```txt
Socket.IO exchanges WebRTC offers/answers/candidates
Central/helper server sends a peer directory for online/local-only shared-chat users
Browser attempts to open a chat-events data channel to directory peers
New chat events are sent over open data channels to active chat members only
Receiving browser stores acceptable peer events in IndexedDB
Connected receivers can upload accepted peer events to central/helper
Peers ACK stored events
Peers exchange event summaries when the channel opens
Peers request and backfill missing events by eventId
Central later deduplicates by eventId when peers reconnect
```

Limitations:

- Peers must be known active chat members, discovered through the central/helper peer directory while signaling is available.
- Peer events are targeted to active chat members; browsers do not store
  non-member peer payloads as relay-only data.
- Signaling must happen while central or helper Socket.IO is reachable.
- WebRTC connectivity depends on browser and network NAT behavior.
- Manual QR/code signaling is not implemented yet.
- Peer ACKs are visible as a demo counter, not polished per-message UI.
- Same-browser local broadcasts are scoped to the same selected demo user; they
  are not a substitute for cross-user WebRTC delivery.


## Prepared peer directory

The central/helper server broadcasts a peer directory to connected browsers. Each user receives only peers who share active chats with them. Local-only tabs still keep the socket available for signaling, so other shared-chat users can prepare WebRTC links before they also move into local-only mode.

This fixes an important outage case: if Denis has prepared a peer link with Anna, Anna later prepares one with Kate, and Kate sends a group message that includes Denis, Kate should already know Denis as a targetable shared-chat peer if both were connected while the directory was available. Without the directory, the peer graph could depend too much on whichever chat each user happened to open.

The directory must also survive demo user switching correctly. If a browser window was Kate and is changed to Ivan, the old peer state is cleared, the socket announces Ivan with a fresh `client:hello`, and new Ivan targets are prepared. This avoids a bug where Anna could still reach Denis in local-only mode, but Ivan missed the group message because the browser retained Kate-oriented peer state.

## Mesh Protocol

Each browser maintains a local event log and a list of known peers. Events are
replicated across peers using WebRTC data channels.

Implemented messages:

```txt
event:new
  send a new event to peers

event:ack
  peer confirms it has stored the event

event:summary
  peer sends list of event IDs it knows

event:request-missing
  peer asks for missing events

event:batch
  peer sends missing events
```

## Peer ACKs

Each browser stores ACKs like this:

```ts
type PeerAck = {
  eventId: string
  peerDeviceId: string
  acknowledgedAt: string
}
```

This makes message state clearer:

```txt
Local only
Replicated to 2 peers
Helper synced
Central synced
```

The current UI exposes a simple ACK counter and last peer event type in the hero
status panel.

## Group Chats

A group chat can be treated as pairwise event replication.

If Denis sends a group message to Anna, Mark, and Kate:

```txt
Denis stores event locally
Denis sends event to Anna, Mark and Kate if their data channels are open
Each reached peer validates membership and stores the same event
Connected peers can upload the original event without changing the sender
Peers ACK the event
Later any browser can upload the event to central
Central stores it once by eventId
```

## Discovery And Signaling

WebRTC still needs signaling. The project should not pretend browsers can
automatically discover every peer on a LAN without a signaling path.

Possible signaling sources:

- central server while online
- helper node while available
- central/helper peer directory for active shared-chat peers
- already established peer links
- QR/manual exchange for emergency cases

The realistic claim is:

> Mesh mode works best for already-known users and already-prepared peer
> relationships. It is a peer-assisted outage mode, not a universal replacement
> for server infrastructure.

## Conflict Rules

Messages are simple:

```txt
message.created = append-only, deduplicate by eventId
```

Read receipts are mergeable:

```txt
message.read = merge by user and message
```

Membership changes need stronger rules:

```txt
member.added/member.removed = central validates after reconnect
```

For the current mesh version, outage mode focuses on existing chats and
messages. Production-grade offline membership changes would need signed events,
authorisation rules and conflict repair UI.

## Recovery After Mesh Mode

When central connectivity returns:

```txt
Browser uploads local event log
Connected peer may already have uploaded a peer-replicated event
Central deduplicates by eventId
Central validates permissions
Central marks accepted events as central-synced
Browser receives official sync result
Conflicts are shown clearly
```


## User-switched windows and notifications

A second user-switch issue can happen when a window changes from Kate to Ivan after other peers have already entered local-only mode. A peer event may be recoverable, but a browser notification could open a new Ivan window if the service worker still sees the old Kate URL.

The app handles this by updating the URL `user` parameter and announcing the current selected user to the service worker whenever the demo user changes. Notification clicks can then focus the existing Ivan window, and the existing tab can open the relevant chat rather than relying on a new app instance.
