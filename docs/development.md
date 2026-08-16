# Development guide

## Setup

```bash
corepack enable
pnpm install
pnpm check
```

The repository currently contains the Task 001 workspace skeleton and therefore installs no third-party runtime dependencies. Later tasks will add package-specific setup and `.env.example` files.

## Task lifecycle

Every task follows the same loop:

1. Inspect the SRS, relevant code, data, and ADRs.
2. State the bounded vertical slice and acceptance criteria.
3. Implement without moving authoritative rules into the browser.
4. Add unit, integration, or end-to-end coverage proportional to the change.
5. Run lint, type checking, tests, and builds.
6. Manually verify the relevant player scenario.
7. Summarize changed files, verification, and remaining issues.

## Workspace conventions

- TypeScript packages use strict mode when code is introduced.
- Package names use the `@eldoria/*` scope.
- Internal dependencies use the pnpm `workspace:*` protocol.
- Gameplay data is validated at load time before the server starts.
- Protocol messages use an explicit type plus a request ID or sequence when applicable.
- Environment-specific configuration is injected; secrets do not receive source defaults.

## Definition of done

A task is complete only when its SRS acceptance criteria are met, package boundaries remain correct, relevant tests exist, static checks and builds pass, documentation reflects significant architecture changes, and the manual scenario has been verified.
