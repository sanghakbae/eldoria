import { execFileSync } from "node:child_process";
import { chmodSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const globalNodeModules = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
let firebaseToolsRoot = join(globalNodeModules, "firebase-tools");
try {
  require.resolve(join(firebaseToolsRoot, "lib/auth.js"));
} catch {
  const firebaseExecutable = execFileSync("which", ["firebase"], { encoding: "utf8" }).trim();
  firebaseToolsRoot = resolve(dirname(realpathSync(firebaseExecutable)), "../..");
}
const auth = require(join(firebaseToolsRoot, "lib/auth.js"));
const api = require(join(firebaseToolsRoot, "lib/api.js"));
const account = auth.getGlobalDefaultAccount();

if (!account?.tokens?.refresh_token) {
  throw new Error("Firebase CLI login is required. Run `firebase login` without placing credentials in the repository.");
}

const outputPath = process.env.ELDORIA_ADC_PATH ?? "/tmp/eldoria-firebase-adc.json";
const credentials = {
  type: "authorized_user",
  client_id: api.clientId(),
  client_secret: api.clientSecret(),
  refresh_token: account.tokens.refresh_token,
  quota_project_id: process.env.FIREBASE_PROJECT_ID ?? "eldoria-8e943",
};

writeFileSync(outputPath, `${JSON.stringify(credentials)}\n`, { encoding: "utf8", mode: 0o600 });
chmodSync(outputPath, 0o600);
console.info(`Firebase local ADC prepared at ${outputPath}.`);
