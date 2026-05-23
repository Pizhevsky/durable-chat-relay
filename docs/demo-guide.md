# Demo Guide

## Demo paths

There are two useful demo paths.

## Path 1 — original Node central

Use this to demo the original project without Laravel:

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:1234
```

Runtime:

```txt
Vue client :1234 -> Node central :3000 -> SQLite
```

## Demo 1 — original standalone usage

1. Start `npm run dev`.
2. Open `http://localhost:1234`.
3. Select Denis.
4. Create a direct chat with Anna.
5. Open Anna in another window from the demo panel.
6. Send messages in both directions.

Expected:

```txt
browser talks directly to Node central over Socket.IO
central stores events once by event id
chat list and messages update in both windows
direct chat uses one canonical pair key
```

## Demo 2 — browser local only on original path

1. Keep the original `npm run dev` path running.
2. Open two demo users.
3. Put one tab into local only mode.
4. Send a message.
5. Reconnect the tab.
6. Watch pending events retry.

Expected:

```txt
IndexedDB keeps local work
reconnect retries pending events
central receives one event id
```

## Demo 3 — WebRTC peer assisted path

1. Open users who share a chat.
2. Let peer signalling establish a data channel.
3. Put one tab into local only mode.
4. Send a message.
5. Confirm peer event replication if the channel exists.

Expected:

```txt
known active peers can receive replicated events
central still remains authoritative after sync
```

## Path 2 — Laravel central through helper

Start Laravel central in the Laravel repository:

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000
```

Start helper and client in this repository:

```bash
npm run dev:laravel
```

Open:

```txt
http://localhost:1234?api=http://localhost:3001
```

Runtime:

```txt
Vue client :1234 -> Node helper :3001 -> Laravel central :8000 -> PostgreSQL
```

## Demo 4 — helper sync to Laravel

1. Start Laravel.
2. Start `npm run dev:laravel`.
3. Open the Vue app through the helper URL.
4. Create a chat.
5. Send a message.
6. Check Laravel `events` and `messages` tables.

Expected:

```txt
helper signs sync requests
Laravel accepts the helper id and signature
events are stored once
messages are projected once
```

## Demo 5 — central outage and retry

1. Start Laravel and helper.
2. Stop Laravel.
3. Create or send a helper local event.
4. Restart Laravel.
5. Wait for helper retry.

Expected:

```txt
helper retries pending events
Laravel accepts them after it returns
same event id is not duplicated
```

## Demo 6 — direct chat duplicate reconciliation

Use two helpers or two helper databases if possible.

```txt
Helper A creates direct chat Denis + Anna while central is unavailable.
Helper B creates the same direct chat Denis + Anna while central is unavailable.
Laravel or original central returns to service.
Helper A syncs first.
Helper B syncs later.
```

Expected:

```txt
central keeps one canonical direct chat
second helper applies authoritative central chat event
local duplicate chat id is remapped
pending messages move to the central chat id
browser state reconciles after receiving the central event
```

## Clean reset

Before switching between demo paths:

```bash
npm run reset:demo
```

Also clear browser storage if old state remains:

```js
localStorage.clear()
sessionStorage.clear()
```

Clear IndexedDB through browser DevTools when testing recovery from a clean state.
