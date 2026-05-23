# WebRTC Peer Mode

## Purpose

WebRTC peer mode is a fallback path between already known active browsers. It helps when central/helper delivery is temporarily unavailable for a tab.

It does not replace the central server.

## Discovery boundary

Browsers can only prepare peer connections after Socket.IO signalling has introduced them.

The server sends peer directories only for users who share active chats. It does not provide a global online user list.

## Event replication

When a peer channel exists:

```txt
sender creates event
sender stores event locally
sender replicates event to known chat peers
receiver validates chat membership locally
receiver stores event and ACKs it
receiver syncs original event to central if it has central/helper access
```

## Central authority

Central remains authoritative after sync:

```txt
original Node central for original path
Laravel central for Laravel integration path
```

Peer replicated events remain retryable until central confirmation.

## Limits

WebRTC peer mode does not:

```txt
wake closed browsers
discover users who were never signalled
send messages to unrelated users
replace central conflict handling
provide production encryption or identity verification by itself
```
