export type GameServerConfig = {
  host: string;
  port: number;
  firebaseProjectId: string;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): GameServerConfig {
  const rawPort = environment.PORT ?? "8787";
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid PORT: ${rawPort}`);
  }
  return { host: environment.HOST ?? "0.0.0.0", port, firebaseProjectId: environment.FIREBASE_PROJECT_ID ?? "eldoria-8e943" };
}
