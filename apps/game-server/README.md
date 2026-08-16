# @eldoria/game-server

Authoritative Node.js game server. Runtime world state, validation, combat, AI, economy mutations, and persistence orchestration belong here.

```bash
pnpm --filter @eldoria/game-server dev
```

Environment variables:

- `HOST` defaults to `0.0.0.0`.
- `PORT` defaults to `8787`.
- `FIREBASE_PROJECT_ID` defaults to `eldoria-8e943`.
- `CHARACTER_STORE=memory` is reserved for isolated tests. Normal development connects to the real Firestore project using the signed-in Firebase CLI account.

The local ADC is generated at `/tmp/eldoria-firebase-adc.json` with mode `0600` and is never stored in the repository. The production `start` command uses Cloud Firestore through Firebase Admin Application Default Credentials. Provide `GOOGLE_APPLICATION_CREDENTIALS` outside source control, use workload identity on the host, or set `FIRESTORE_EMULATOR_HOST` for an emulator. Character writes are never accepted directly from the browser.

Run `pnpm --filter @eldoria/game-server seed:foods` to upsert the data-driven food catalog. It writes 250 definitions (50 each for fish, birds, meat animals, vegetables, and fruit) to `gameContentFoods` and catalog metadata to `gameContent/foodCatalog`.
