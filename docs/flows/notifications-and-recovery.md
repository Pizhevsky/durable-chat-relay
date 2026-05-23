# Notifications And Recovery

## Notification path

The client includes a service worker notification path so a notification click can reopen the app into the relevant chat.

This is useful for demoing lifecycle behaviour, but it is not a full production push system unless VAPID keys, push subscriptions and backend delivery are configured.

## Browser recovery export

The browser can export local recovery data from IndexedDB.

This is useful when events exist in the browser but have not reached central yet.

## Recovery import

Recovery import sends event dumps back to central so central can deduplicate and rebuild official history.

In original direct mode, the Vue client posts recovery data to the Node central. In Laravel integration mode, the normal browser transport is still the Node helper; Laravel also exposes its own HTTP recovery import for operator/demo use.

Central still owns idempotency:

```txt
same event id -> one central event
invalid event -> conflict or rejection
known event -> duplicate
```

## Laravel recovery dry run

The Laravel central server adds a dry run mode:

```http
POST /api/recovery/import?dryRun=true
```

Dry run previews accepted, duplicate and conflicted events without writing to PostgreSQL.

## Security scope

Helper sync endpoints are signed. Recovery import remains a demo level recovery path and would need stronger production controls before real use:

```txt
real user authentication
per chat authorization
signed/verifiable device events
operator audit trail
manual conflict repair
```


## SHA-256 recovery checksum

Recovery exports include a SHA-256 checksum calculated from the canonical events payload. Recovery import verifies this checksum before accepting or previewing events, so truncated or manually corrupted dumps are rejected instead of being applied silently.
