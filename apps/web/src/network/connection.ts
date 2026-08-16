export function resolveGameServerUrl(location: Pick<Location, "hostname" | "protocol">, configuredUrl?: string): string {
  if (configuredUrl) return configuredUrl;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.hostname}:8787`;
}
