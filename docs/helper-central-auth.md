# Helper To Central Authorization

The Node helper signs central sync requests with an HMAC signature. Both central implementations verify the same contract:

```txt
Node helper -> original Node central
Node helper -> Laravel central
```

## Protected endpoints

```http
POST /api/sync/events
GET  /api/sync/events?since=...&limit=...
```

## Headers

```txt
X-DCR-Helper-Id: helper-demo
X-DCR-Timestamp: 2026-05-22T00:00:00Z
X-DCR-Signature: <hex hmac sha256>
```

Signature payload:

```txt
timestamp + "
" + method + "
" + path-with-query + "
" + raw-body
```

Examples:

```txt
POST /api/sync/events
GET  /api/sync/events?since=0&limit=200
```

For GET requests, the raw body is an empty string.

## Local configuration

Original project `.env` or script values:

```env
DCR_HELPER_SHARED_SECRET=local-dev-helper-secret
DCR_TRUSTED_HELPER_IDS=helper-demo
DCR_HELPER_SIGNATURE_TOLERANCE_SECONDS=300
```

Laravel `.env` must use the same helper secret and trusted helper id:

```env
DCR_HELPER_SHARED_SECRET=local-dev-helper-secret
DCR_TRUSTED_HELPER_IDS=helper-demo
DCR_HELPER_SIGNATURE_TOLERANCE_SECONDS=300
```

## Commands

Helper to original Node central:

```bash
npm run dev:central
npm run dev:helper
```

Helper to Laravel central:

```bash
npm run helper:laravel
```

Helper and Vue client to Laravel central:

```bash
npm run dev:laravel
```

## Failure behaviour

If the signature is missing, stale, signed with the wrong secret, or sent from an untrusted helper id, central returns `401`.

Expected error codes include:

```txt
helper_signature_not_configured
unknown_helper
missing_helper_signature
invalid_helper_timestamp
stale_helper_signature
invalid_helper_signature
```

## Security scope

This is helper to central authorization only. It does not authenticate browser users, authorize individual chat actions, encrypt messages, or provide production key rotation.
