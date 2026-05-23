# Project Positioning

## What this project is

Durable Chat Relay is a resilience prototype for chat workflows where connectivity cannot be assumed.

It demonstrates:

- event based chat state
- local helper sync
- browser storage recovery
- retry safe event ids
- duplicate direct chat protection
- helper to central request signing
- peer assisted delivery between already known active peers
- integration with an additional Laravel central server

## What the Laravel project adds

The Laravel repository adds a second central implementation:

```txt
Laravel 12 + PostgreSQL central HTTP authority
```

It is useful for demonstrating:

- PHP 8.x OOP backend design
- PostgreSQL event storage
- helper contract compatibility
- Node helper to Laravel central integration
- signed helper sync verification
- central idempotency and projections

## What belongs here

This original project owns:

```txt
Vue client
Socket.IO transport
Node helper
original Node central
SQLite helper and central stores
IndexedDB recovery
WebRTC peer path
service worker notification path
```

## What belongs to Laravel

The Laravel project owns:

```txt
central HTTP sync API
PostgreSQL durable event log
PHP OOP domain layer
Laravel migrations and tests
readiness endpoint
recovery dry run
```

## Current limits

The project is not a production secure messaging platform.

Remaining production gaps:

- full user authentication
- per chat authorization
- signed browser/device events
- message encryption
- production key rotation
- deployment hardening
- observability dashboards
- load testing
- full automated WebRTC failure scenario coverage
