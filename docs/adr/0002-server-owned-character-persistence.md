# ADR 0002: Server-owned character persistence

- Status: Accepted
- Date: 2026-08-16

## Context

SRS Task 008 requires character creation, listing, selection, and durable state. Browser Firestore writes would allow clients to author character ownership or saved position and would violate the server-authoritative boundary.

## Decision

The WebSocket game server owns all character mutations through a `CharacterRepository` boundary. The production adapter uses Firebase Admin and Cloud Firestore. Firestore browser rules deny character writes. Because Firebase Emulator Suite requires a Java runtime that is not installed in the current workspace environment, normal local development derives a permission-restricted temporary ADC from the already authenticated Firebase CLI account and uses the real development Firestore database.

The client sends only `character.create` and `character.select` intent messages. The server derives ownership from the verified Firebase identity, enforces names and per-account limits, loads the selected checkpoint, and saves position when the session disconnects.

Production credentials use Application Default Credentials or workload identity and are never committed. The memory adapter is restricted to isolated automated tests.

## Consequences

- Client code cannot choose `ownerUid` or write a position checkpoint.
- Repository tests can run without external services while normal development verifies real Firestore writes.
- The temporary local ADC lives outside the repository with owner-only filesystem permissions.
- Position is checkpointed at a persistence boundary rather than written on every movement tick.
