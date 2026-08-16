# Eldoria

Eldoria is an original, web-first 2D sandbox MMORPG. The project follows a server-authoritative architecture: React and Phaser present the world, a Node.js game server owns runtime game rules, and Firebase provides identity and durable application data.

The product and engineering baseline is [SRS.md](./SRS.md). Development intentionally proceeds one vertical slice at a time; copyrighted assets or content from existing games must not be used.

## Current status

Tasks 001–006 are complete: the monorepo, React/Vite client, Phaser world scene, Node.js game server, shared protocol, live WebSocket handshake, and Firebase browser authentication are operational. Firestore is connected with server-owned write boundaries for the upcoming character persistence slice.

## Repository map

```text
apps/
  web/             React + Phaser browser client (Task 002+)
  game-server/     Authoritative Node.js WebSocket server (Task 004+)
  admin/           Administrative console (later phase)
packages/
  game-core/       Pure deterministic domain calculations
  game-protocol/   Versioned client/server message contracts
  game-data/       Typed access to data-driven content
  shared-types/    Cross-package types without authoritative rules
  ui/              Reusable presentation components
assets/            Original or licensed-for-project media
data/              Gameplay content and balance configuration
database/          Firebase rules, indexes, and emulator fixtures
docs/              Architecture, decisions, and development guides
tools/             Repository maintenance and content tooling
```

## Prerequisites

- Node.js 22 or 24 LTS (`.nvmrc` selects 24)
- pnpm 10
- Firebase CLI and Docker when later tasks introduce emulator-backed services

## Commands

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
```

`pnpm dev` starts the browser client at `http://localhost:5173` and the game server at `http://localhost:8787`; the server health endpoint is `/health`.

The web build deploys to `https://eldoria.sanghak.kr` through GitHub Pages. Repository variables supply public Firebase web configuration during the build; local values belong in the ignored `apps/web/.env.local` file.

Root commands fan out only to workspace packages that implement the matching script, so the commands remain stable as each application is added.

## Development rules

- Treat all client input as untrusted intent.
- Keep movement, combat, inventory, loot, skills, economy, and persistence mutations authoritative on the game server.
- Keep gameplay balance and content in data rather than hard-coding it into systems.
- Add tests with every meaningful game rule.
- Never commit secrets or Firebase Admin credentials.
- Do not add Redis, PostgreSQL, Kubernetes, or microservices during the MVP without a demonstrated requirement.

See [docs/development.md](./docs/development.md) for the development workflow and [docs/architecture.md](./docs/architecture.md) for package boundaries.
