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

- [Messaging and sync](./messaging-and-sync.md) covers chat creation, message delivery, helper sync and cursor pull.
- [Resilience and failure](./resilience-and-failure.md) covers local only mode, helper outage, central outage, direct chat reconciliation and WebRTC fallback.
- [Notifications and recovery](./notifications-and-recovery.md) covers notification behaviour and recovery export/import.
- [User lifecycle](./user-lifecycle.md) covers demo user switching and peer/session cleanup.

Related docs:

- [Demo guide](../demo-guide.md) shows how to demonstrate these flows.
- [Architecture](../architecture.md) shows where the flows run.
- [Shared integration contract](../shared-integration-contract.md) defines the cross-project helper sync contract.
