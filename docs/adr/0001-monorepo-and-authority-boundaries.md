# ADR 0001: Monorepo and authority boundaries

- Status: Accepted
- Date: 2026-08-16

## Context

The project must share contracts and deterministic domain logic across a browser client, a real-time game server, and a later admin application without allowing the client to become authoritative. It also needs to grow one vertical slice at a time without premature distributed infrastructure.

## Decision

Use a pnpm monorepo with applications under `apps/` and reusable packages under `packages/`. Keep authoritative command validation and state mutation in `apps/game-server`. Keep shared packages framework-neutral and prohibit application-to-application dependencies.

Firebase supplies authentication and persistent application data. The Node.js game server owns the live simulation. Redis, PostgreSQL, Kubernetes, and microservices are excluded from the MVP baseline.

## Consequences

- Client and server can share versioned contracts without duplicating message types.
- Pure domain calculations can be tested independently of Phaser, WebSocket, or Firebase.
- Client prediction remains cosmetic because the server validates and recalculates results.
- Additional package boundaries add modest setup overhead, which is accepted to make authority and dependencies explicit.
- Scaling infrastructure will require a later ADR backed by measured demand.
