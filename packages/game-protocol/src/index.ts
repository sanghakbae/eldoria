export type ClientMessage =
  | { type: "connection.hello"; requestId: string; payload: { clientVersion: string } }
  | { type: "connection.ping"; requestId: string; payload: Record<string, never> };

export type ServerMessage =
  | { type: "connection.ready"; requestId: string; payload: { serverTime: number; motd: string } }
  | { type: "connection.pong"; requestId: string; payload: { serverTime: number } }
  | { type: "error"; requestId: string; payload: { code: string; message: string } };

export function encodeMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}

export function decodeClientMessage(raw: string): ClientMessage | null {
  const value = parseEnvelope(raw);
  if (!value) return null;
  if (value.type === "connection.hello" && isRecord(value.payload) && typeof value.payload.clientVersion === "string") return value as ClientMessage;
  if (value.type === "connection.ping" && isRecord(value.payload)) return value as ClientMessage;
  return null;
}

export function decodeServerMessage(raw: string): ServerMessage | null {
  const value = parseEnvelope(raw);
  if (!value || !isRecord(value.payload)) return null;
  if (value.type === "connection.ready" && typeof value.payload.serverTime === "number" && typeof value.payload.motd === "string") return value as ServerMessage;
  if (value.type === "connection.pong" && typeof value.payload.serverTime === "number") return value as ServerMessage;
  if (value.type === "error" && typeof value.payload.code === "string" && typeof value.payload.message === "string") return value as ServerMessage;
  return null;
}

function parseEnvelope(raw: string): { type: string; requestId: string; payload: unknown } | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.type !== "string" || typeof value.requestId !== "string" || !("payload" in value)) return null;
    return { type: value.type, requestId: value.requestId, payload: value.payload };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
