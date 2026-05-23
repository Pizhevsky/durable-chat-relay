# OOP And Code Boundaries

This project uses TypeScript modules and classes where they make the resilience model clearer. It does not force every part of the Vue/Node codebase into formal OOP.

The useful boundaries are around the hard parts of the system: sync, event storage, direct-chat identity, helper authorization and projection.

## Main structure

| Area | Responsibility |
|---|---|
| `ChatEventService` | Application facade used by routes and sockets. |
| `ChatEventStore` | Event persistence in SQLite. |
| `ChatEventProjector` | Projects accepted events into read models. |
| `ChatReadModel` | Query side for chats, messages and users. |
| `CentralSyncClient` | Adapter used by the helper to talk to either central implementation. |
| `HelperSignatureService` | HMAC signing and verification for helper-to-central sync. |
| `DirectPairKey` | Value object for canonical direct chat identity. |
| Policies | Small rule objects for membership and direct-chat decisions. |

## Adapter: central sync client

The helper can sync with either:

```txt
original Node central
Laravel central
```

`CentralSyncClient` hides the HTTP details:

```txt
sign request
push pending events
pull missed events by cursor
normalise central responses
return accepted, duplicate, conflict and server event data
```

This keeps helper sync code focused on local retry and reconciliation instead of raw HTTP details.

## Service object: helper signature

`HelperSignatureService` owns the HMAC behaviour:

```txt
build signature payload
sign helper sync requests
verify signed central sync requests
check timestamp tolerance
reject unknown helper ids
```

The browser never receives this secret. It is a server-to-server helper trust boundary only.

## Value object: direct pair key

A direct chat pair key is not an arbitrary string. It means:

```txt
two unique users
sorted stable order
same pair always produces the same key
```

`DirectPairKey` makes that rule visible and keeps duplicate direct-chat prevention consistent across normal chat, helper sync and recovery.

## Why there is no heavy pattern layer

Some patterns would add more noise than value here:

- no full pipeline framework for event acceptance
- no abstract factory for repositories
- no deep inheritance hierarchy for event handlers
- no state classes for every sync status

The project is strongest when the code shows clear responsibilities around real failure cases, not when it uses pattern names for their own sake.

## Relationship with the Laravel project

The Laravel central server uses a more formal PHP OOP structure with services, DTOs, enums, repositories and policies. This original project stays idiomatic TypeScript while sharing the same architecture language around helper sync, direct-chat identity and idempotent event handling.
