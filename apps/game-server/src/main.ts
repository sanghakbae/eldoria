import { loadConfig } from "./config";
import { createGameServer } from "./server";
import { createFirebaseTokenVerifier } from "./auth-verifier";
import { createFirestoreCharacterRepository } from "./firestore-character-repository";
import { MemoryCharacterRepository } from "./character-repository";

const config = loadConfig();
const characters = process.env.CHARACTER_STORE === "memory" ? new MemoryCharacterRepository() : createFirestoreCharacterRepository(config.firebaseProjectId);
const server = await createGameServer(config, {
  verifyIdToken: createFirebaseTokenVerifier(config.firebaseProjectId),
  characters,
});

console.info(JSON.stringify({ event: "server.start", address: server.address }));

async function shutdown(signal: string) {
  console.info(JSON.stringify({ event: "server.stop", signal }));
  await server.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
