# Helper Node Guide

A helper node is a lightweight local process for areas or field offices that need stronger local durability than browser-only mode.

## Start helper

```bash
NODE_ROLE=helper \
NODE_ID=field-area-01 \
PORT=3001 \
DATABASE_PATH=./data/helper.sqlite \
CENTRAL_URL=http://localhost:3000 \
npm run helper
```

## What users do

Users connect to the helper URL from the same local network.

```txt
http://helper-laptop-ip:3001
```

The helper stores events locally while central is unreachable, then pushes them to central when the connection returns.

## Minimum responsibilities

- local Socket.IO relay
- local SQLite event store
- central sync queue
- pull sync for missed central events
- exponential backoff during outages
- recovery export
- future peer signaling

## What it should not become

- permanent branch server
- heavy admin system
- full identity provider
- manual database management responsibility

