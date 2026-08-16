import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { loadConfig } from "./config";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("Usage: pnpm --filter @eldoria/game-server grant:admin <email>");

const config = loadConfig();
const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: config.firebaseProjectId });
const auth = getAuth(app);
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin: true });
console.log(`Granted Eldoria admin claim to ${email} (${user.uid}).`);
