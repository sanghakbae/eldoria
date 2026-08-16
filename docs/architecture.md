# Architecture baseline

## Runtime topology

```text
React UI + Phaser renderer
            |
      intent messages
            v
Authoritative Node.js game server
            |
      Firebase Admin SDK
            v
 Firebase Auth + Firestore + Storage
```

The browser owns presentation, input, animation, and local UI state. The game server owns runtime world state and validates all commands. Firebase owns identity and durable application data; it is not the real-time world simulation database.

## Workspace boundaries

| Workspace | Owns | Must not own |
| --- | --- | --- |
| `apps/web` | Screens, responsive UI, Phaser rendering, input adapters, client networking | Authoritative HP, position validity, damage, loot, skills, gold, or item ownership |
| `apps/game-server` | Sessions, world state, validation, AI, combat, inventory mutations, persistence orchestration, audit events | Browser presentation or device-specific input |
| `apps/admin` | Authorized operational views and audited admin commands | Unauthenticated mutations or direct trust of browser input |
| `packages/game-core` | Pure deterministic calculations and domain invariants | Network, UI, or database adapters |
| `packages/game-protocol` | Versioned message envelopes and payload contracts | Gameplay state mutation |
| `packages/game-data` | Schemas and typed loaders for content configuration | Per-player runtime state |
| `packages/shared-types` | Stable shared value types and identifiers | Secrets or server adapters |
| `packages/ui` | Reusable presentation components | Game authority |

## Dependency direction

Applications may depend on packages. Packages must not depend on applications. Domain calculations stay free of framework, transport, and Firebase dependencies so that they can be tested deterministically.

The web client may reuse a calculation for prediction or display, but the game server always recalculates and validates the authoritative result.

## State and persistence boundaries

- Server memory: active positions, nearby entities, AI state, combat state, cooldowns, temporary effects.
- Immediate or transactional persistence: characters, gold, inventory, equipment, skill gains, trade, crafting, and economically significant audit events.
- Checkpoint persistence: position and other recoverable runtime state on a safe interval or disconnect, not every simulation tick.

## Deferred infrastructure

Redis, PostgreSQL, Kubernetes, multiple game services, guilds, housing, and native wrappers are intentionally deferred until their SRS phase or a measured need.
