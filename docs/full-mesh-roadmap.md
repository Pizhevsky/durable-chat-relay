# Full Mesh Roadmap

The current project supports peer assisted fallback for already signalled shared chat peers. It is not a full mesh offline network.

## Current scope

```txt
central or helper signalling prepares peer links
peer links are scoped to active shared chat members
peer replicated events remain retryable until central confirmation
central remains authoritative
```

## Future work

A fuller mesh design would need:

- stronger peer identity
- signed device events
- peer trust and revocation
- encrypted payloads
- conflict repair tools
- richer peer discovery
- audit and observability
- tests for larger peer graphs

This roadmap is separate from the Laravel central integration. Laravel provides the central authority, not peer discovery or browser mesh behaviour.
