import { loadConfig } from "./config";
import { createGameServer } from "./server";
import { createFirebaseTokenVerifier } from "./auth-verifier";

const config = loadConfig();
const server = await createGameServer(config, { verifyIdToken: createFirebaseTokenVerifier(config.firebaseProjectId) });

console.info(JSON.stringify({ event: "server.start", address: server.address }));

async function shutdown(signal: string) {
  console.info(JSON.stringify({ event: "server.stop", signal }));
  await server.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
