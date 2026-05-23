# Flow Documents

These documents describe how the original Durable Chat Relay project behaves and how it integrates with the Laravel central server.

Runtime routing:

```txt
Original direct mode:
Vue client -> original Node central Socket.IO/API -> SQLite

Laravel integration mode:
Vue client -> Node helper Socket.IO/API -> Laravel central HTTP sync API -> PostgreSQL
```

Laravel does not provide the browser Socket.IO transport. In the Laravel path, the Vue client must point at the Node helper, and only the helper sends signed HTTP sync requests to Laravel.

- `messaging-and-sync.md` covers chat creation, message delivery, helper sync and cursor pull.
- `resilience-and-failure.md` covers local only mode, helper outage, central outage, direct chat reconciliation and WebRTC fallback.
- `notifications-and-recovery.md` covers notification behaviour and recovery export/import.
- `user-lifecycle.md` covers demo user switching and peer/session cleanup.

For the cross project contract, see `../shared-integration-contract.md`.
