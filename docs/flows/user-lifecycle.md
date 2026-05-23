# User Lifecycle

## Demo user switching

The project uses demo user switching so the resilience flows can be tested on one machine.

When a browser window changes selected user, it must clear stale local session state for the previous user.

Important cleanup:

```txt
leave old Socket.IO rooms
clear stale peer connections
rebuild peer directory for the new user
rebind local cache/session identity
refresh visible chats and messages
```

## Why this matters

A browser window can move from Kate to Ivan during a demo. If stale peer or cache state survives the switch, messages may appear in the wrong session or peer fallback may route events incorrectly.

The expected behaviour is:

```txt
selected user changes
old peer/session state is cleared
new user joins only their own chats
helper and browser state use the new user identity
```

## Laravel integration

Laravel does not manage browser session switching. That remains in the original client and helper path.

The Vue client still switches users through the Node Socket.IO server it is connected to. For Laravel demos, that Node server is the helper.

Laravel only receives signed helper sync HTTP requests with actor/source metadata and applies central validation, idempotency and projection rules.
