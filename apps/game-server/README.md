# @eldoria/game-server

Authoritative Node.js game server. Runtime world state, validation, combat, AI, economy mutations, and persistence orchestration belong here.

```bash
pnpm --filter @eldoria/game-server dev
```

Environment variables:

- `HOST` defaults to `0.0.0.0`.
- `PORT` defaults to `8787`.
- `FIREBASE_PROJECT_ID` defaults to `eldoria-8e943`.
- `CHARACTER_STORE=memory` selects the process-local development repository. The `dev` script sets this automatically so gameplay remains available without local Admin credentials.

The production `start` command uses Cloud Firestore through Firebase Admin Application Default Credentials. Provide `GOOGLE_APPLICATION_CREDENTIALS` outside source control, use workload identity on the host, or set `FIRESTORE_EMULATOR_HOST` for an emulator. Character writes are never accepted directly from the browser.
