export type Position = { zoneId: string; x: number; y: number };

export type NutrientId = "protein" | "fat" | "carbohydrate" | "iron" | "vitaminA" | "vitaminC" | "vitaminD" | "vitaminB12" | "calcium" | "iodine" | "water";
export type NutritionState = Record<NutrientId, number>;
export type SurvivalState = { nutrition: NutritionState; lastMetabolismAt: string };

export type CharacterSummary = {
  id: string;
  name: string;
  position: Position;
  createdAt: string;
  survival: SurvivalState;
};

export type ClientMessage =
  | { type: "connection.hello"; requestId: string; payload: { clientVersion: string } }
  | { type: "connection.ping"; requestId: string; payload: Record<string, never> }
  | { type: "auth"; requestId: string; payload: { idToken: string } }
  | { type: "character.create"; requestId: string; payload: { name: string } }
  | { type: "character.select"; requestId: string; payload: { characterId: string } }
  | { type: "player.move"; requestId: string; payload: { sequence: number; direction: { x: number; y: number } } };

export type ServerMessage =
  | { type: "connection.ready"; requestId: string; payload: { serverTime: number; motd: string } }
  | { type: "connection.pong"; requestId: string; payload: { serverTime: number } }
  | { type: "auth.success"; requestId: string; payload: { uid: string } }
  | { type: "character.list"; requestId: string; payload: { characters: CharacterSummary[] } }
  | { type: "character.created"; requestId: string; payload: { character: CharacterSummary } }
  | { type: "character.selected"; requestId: string; payload: { character: CharacterSummary } }
  | { type: "player.state"; requestId: string; payload: { uid: string; sequence: number; position: Position } }
  | { type: "error"; requestId: string; payload: { code: string; message: string } };

export function encodeMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}

export function decodeClientMessage(raw: string): ClientMessage | null {
  const value = parseEnvelope(raw);
  if (!value) return null;
  if (value.type === "connection.hello" && isRecord(value.payload) && typeof value.payload.clientVersion === "string") return value as ClientMessage;
  if (value.type === "connection.ping" && isRecord(value.payload)) return value as ClientMessage;
  if (value.type === "auth" && isRecord(value.payload) && typeof value.payload.idToken === "string") return value as ClientMessage;
  if (value.type === "character.create" && isRecord(value.payload) && typeof value.payload.name === "string") return value as ClientMessage;
  if (value.type === "character.select" && isRecord(value.payload) && typeof value.payload.characterId === "string") return value as ClientMessage;
  if (value.type === "player.move" && isRecord(value.payload) && typeof value.payload.sequence === "number" && isDirection(value.payload.direction)) return value as ClientMessage;
  return null;
}

export function decodeServerMessage(raw: string): ServerMessage | null {
  const value = parseEnvelope(raw);
  if (!value || !isRecord(value.payload)) return null;
  if (value.type === "connection.ready" && typeof value.payload.serverTime === "number" && typeof value.payload.motd === "string") return value as ServerMessage;
  if (value.type === "connection.pong" && typeof value.payload.serverTime === "number") return value as ServerMessage;
  if (value.type === "auth.success" && typeof value.payload.uid === "string") return value as ServerMessage;
  if (value.type === "character.list" && Array.isArray(value.payload.characters) && value.payload.characters.every(isCharacter)) return value as ServerMessage;
  if (value.type === "character.created" && isCharacter(value.payload.character)) return value as ServerMessage;
  if (value.type === "character.selected" && isCharacter(value.payload.character)) return value as ServerMessage;
  if (value.type === "player.state" && typeof value.payload.uid === "string" && typeof value.payload.sequence === "number" && isPosition(value.payload.position)) return value as ServerMessage;
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

function isPosition(value: unknown): value is { zoneId: string; x: number; y: number } {
  return isRecord(value) && typeof value.zoneId === "string" && typeof value.x === "number" && typeof value.y === "number";
}

function isCharacter(value: unknown): value is CharacterSummary {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.createdAt === "string" && isPosition(value.position) && isSurvivalState(value.survival);
}

function isSurvivalState(value: unknown): value is SurvivalState {
  if (!isRecord(value) || typeof value.lastMetabolismAt !== "string" || !isRecord(value.nutrition)) return false;
  const nutrition = value.nutrition;
  return ["protein", "fat", "carbohydrate", "iron", "vitaminA", "vitaminC", "vitaminD", "vitaminB12", "calcium", "iodine", "water"].every((key) => typeof nutrition[key] === "number");
}

function isDirection(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && typeof value.x === "number" && typeof value.y === "number" && Number.isFinite(value.x) && Number.isFinite(value.y) && Math.abs(value.x) <= 1 && Math.abs(value.y) <= 1;
}
