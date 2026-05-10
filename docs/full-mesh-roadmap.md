# Peer Mesh Notes

Peer mesh mode is the WebRTC peer-to-peer extension for already-known users.

## Purpose

Allow already-known users to continue exchanging and recovering chat events when central and helper nodes are unavailable.

## Implemented pieces

1. WebRTC data channel setup
2. Signaling through central/helper while online
3. Target filtering by active chat members
4. Event replication protocol
5. Peer ACK storage
6. Summary and missing-event exchange
7. Batch backfill over the data channel
8. Recovery sync to central after reconnect

## Protocol

```txt
event:new
event:ack
event:summary
event:request-missing
event:batch
```

## Remaining roadmap

- polished per-message peer replication UI
- manual QR/code signaling fallback
- richer group delivery status
- conflict repair UI for rejected membership events

## Honest limitation

Browsers cannot reliably discover every peer on a LAN without some form of signaling. Full mesh mode should be described as peer-assisted fallback for known users, not a universal serverless replacement.
