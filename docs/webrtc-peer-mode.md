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
Browser opens a chat-events data channel to known chat peers
New chat events are sent over the data channel
Receiving browser stores peer events in IndexedDB
Peers ACK stored events
Peers exchange event summaries when the channel opens
Peers request and backfill missing events by eventId
Central later deduplicates by eventId when peers reconnect
```

Limitations:

- Peers must be known active chat members.
- Signaling must happen while central or helper Socket.IO is reachable.
- WebRTC connectivity depends on browser and network NAT behavior.
- Manual QR/code signaling is not implemented yet.
- Peer ACKs are visible as a demo counter, not polished per-message UI.

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
Denis sends event to Anna, Mark and Kate
Each peer stores the same event
Peers ACK the event
Later any browser can upload the event to central
Central stores it once by eventId
```

## Discovery And Signaling

WebRTC still needs signaling. The project should not pretend browsers can
always discover each other magically on a LAN.

Possible signaling sources:

- central server while online
- helper node while available
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

For the first mesh version, outage mode focuses on existing chats and messages.
New memberships can be accepted locally but marked as requiring central
confirmation.

## Recovery After Mesh Mode

When central connectivity returns:

```txt
Browser uploads local event log
Central deduplicates by eventId
Central validates permissions
Central marks accepted events as central-synced
Browser receives official sync result
Conflicts are shown clearly
```
