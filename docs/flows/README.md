# App Flows

This folder describes the main runtime flows of Durable Chat Relay.

Use these files when checking whether a user path is expected, already implemented, demo-only, or still a limitation.

## Flow Files

- [User Lifecycle](user-lifecycle.md): first open, user switching, refresh, close, reopen, server restart.
- [Messaging And Sync](messaging-and-sync.md): chat creation, message send, read receipts, pending outbox, automatic retry.
- [Resilience And Failure](resilience-and-failure.md): local-only mode, helper node, WebRTC peer fallback, duplicate direct chats, unavailable users.
- [Notifications And Recovery](notifications-and-recovery.md): permission, foreground notifications, service-worker click flow, recovery dump import/export.

## Short Truth Table

| Question | Answer |
|---|---|
| Does the app sync browser-saved data after reopen? | Yes, from the same browser profile, when the app reconnects. |
| Can another user's browser sync my unsent local data? | No. Local IndexedDB data belongs to the browser that created it. |
| Does WebRTC deliver to users who were never online? | No. It only helps already-signaled open peers. |
| Does server restart delete chats? | No, if the SQLite database file is preserved. |
| Is this secure production auth? | No. This is demo auth with demo user switching and demo headers. |

## Main Data Stores

```txt
Central SQLite
  official event log and projected chat state

Helper SQLite
  temporary helper event log, later synced to central

Browser IndexedDB
  local outbox, cached users/chats/messages, peer-replicated events

Service worker
  notification display and notification-click routing
```

## Main Transports

```txt
Socket.IO
  normal realtime delivery and WebRTC signaling

REST sync
  helper-to-central push/pull and recovery import/export

WebRTC data channels
  peer event replication between already-signaled open browsers
```
