export type Position = { zoneId: string; x: number; y: number };

export type NutrientId = "protein" | "fat" | "carbohydrate" | "iron" | "vitaminA" | "vitaminC" | "vitaminD" | "vitaminB12" | "calcium" | "iodine" | "water";
export type NutritionState = Record<NutrientId, number>;
export type InventoryStack = { itemId: string; quantity: number };
export type SkillProgress = { value: number; completedActions: number };
export type SkillLock = "up" | "down" | "locked";
export type VitalState = { current: number; maximum: number };
export type BuiltStructure = { id: string; type: "log-shelter" | "wood-bridge"; zoneId: string; x: number; y: number };
/** What is worn or held, keyed by layer slot. `equipped` is the older single-slot form, kept so
 *  characters saved before the rig existed still load. */
export type Equipment = Partial<Record<string, string | null>>;
export type SurvivalState = { nutrition: NutritionState; lastMetabolismAt: string; inventory?: InventoryStack[]; skills?: Record<string, SkillProgress>; locks?: Record<string, SkillLock>; health?: VitalState; equipped?: string | null; equipment?: Equipment; toolWear?: Record<string, number>; structures?: BuiltStructure[] };
export type ActionOutcome = { success: boolean; chance: number; skillId: string; gain: number; drained: Array<{ skillId: string; amount: number }> };
export type TargetState = { health: number; maximumHealth: number; defeated: boolean };
export type CombatState = { counterDamage: number; playerDefeated: boolean };
export type WorldObjectState =
  | { kind: "resource"; zoneId: string; objectId: string; remaining: number; maximum: number; exhaustedUntil: number }
  | { kind: "wildlife"; zoneId: string; objectId: string; health: number; maximumHealth: number; defeatedUntil: number };
export type CharacterGender = "female" | "male";

export type CharacterSummary = {
  id: string;
  name: string;
  gender: CharacterGender;
  position: Position;
  createdAt: string;
  survival: SurvivalState;
};

export type ClientMessage =
  | { type: "connection.hello"; requestId: string; payload: { clientVersion: string } }
  | { type: "connection.ping"; requestId: string; payload: Record<string, never> }
  | { type: "auth"; requestId: string; payload: { idToken: string } }
  | { type: "character.create"; requestId: string; payload: { name: string; gender: CharacterGender } }
  | { type: "character.select"; requestId: string; payload: { characterId: string } }
  | { type: "player.move"; requestId: string; payload: { sequence: number; direction: { x: number; y: number } } }
  | { type: "world.interact"; requestId: string; payload: { objectId: string } }
  | { type: "world.observe"; requestId: string; payload: { zoneId: string } }
  | { type: "skill.lock"; requestId: string; payload: { skillId: string; lock: SkillLock } }
  | { type: "item.eat"; requestId: string; payload: { itemId: string } }
  | { type: "item.equip"; requestId: string; payload: { itemId: string | null; slot?: string } }
  | { type: "craft.attempt"; requestId: string; payload: { recipeId: string } };

export type ServerMessage =
  | { type: "connection.ready"; requestId: string; payload: { serverTime: number; motd: string } }
  | { type: "connection.pong"; requestId: string; payload: { serverTime: number } }
  | { type: "auth.success"; requestId: string; payload: { uid: string } }
  | { type: "character.list"; requestId: string; payload: { characters: CharacterSummary[] } }
  | { type: "character.created"; requestId: string; payload: { character: CharacterSummary } }
  | { type: "character.selected"; requestId: string; payload: { character: CharacterSummary } }
  | { type: "player.state"; requestId: string; payload: { uid: string; sequence: number; position: Position } }
  | { type: "world.snapshot"; requestId: string; payload: { zoneId: string; objects: WorldObjectState[] } }
  | { type: "world.object"; requestId: string; payload: { object: WorldObjectState } }
  | { type: "world.action"; requestId: string; payload: { objectId: string; actionId: string; message: string; reward?: InventoryStack; survival?: SurvivalState; outcome?: ActionOutcome; target?: TargetState; combat?: CombatState } }
  | { type: "skill.locked"; requestId: string; payload: { skillId: string; lock: SkillLock; survival: SurvivalState } }
  | { type: "item.eaten"; requestId: string; payload: { itemId: string; message: string; survival: SurvivalState } }
  | { type: "item.equipped"; requestId: string; payload: { itemId: string | null; slot: string; survival: SurvivalState } }
  | { type: "craft.result"; requestId: string; payload: { recipeId: string; success: boolean; message: string; outcome?: ActionOutcome; survival: SurvivalState } }
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
  if (value.type === "character.create" && isRecord(value.payload) && typeof value.payload.name === "string" && isCharacterGender(value.payload.gender)) return value as ClientMessage;
  if (value.type === "character.select" && isRecord(value.payload) && typeof value.payload.characterId === "string") return value as ClientMessage;
  if (value.type === "player.move" && isRecord(value.payload) && typeof value.payload.sequence === "number" && isDirection(value.payload.direction)) return value as ClientMessage;
  if (value.type === "world.interact" && isRecord(value.payload) && typeof value.payload.objectId === "string") return value as ClientMessage;
  if (value.type === "world.observe" && isRecord(value.payload) && typeof value.payload.zoneId === "string") return value as ClientMessage;
  if (value.type === "skill.lock" && isRecord(value.payload) && typeof value.payload.skillId === "string" && isSkillLock(value.payload.lock)) return value as ClientMessage;
  if (value.type === "item.eat" && isRecord(value.payload) && typeof value.payload.itemId === "string") return value as ClientMessage;
  if (value.type === "item.equip" && isRecord(value.payload) && (typeof value.payload.itemId === "string" || value.payload.itemId === null) && (value.payload.slot === undefined || typeof value.payload.slot === "string")) return value as ClientMessage;
  if (value.type === "craft.attempt" && isRecord(value.payload) && typeof value.payload.recipeId === "string") return value as ClientMessage;
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
  if (value.type === "world.snapshot" && typeof value.payload.zoneId === "string" && Array.isArray(value.payload.objects) && value.payload.objects.every(isWorldObjectState)) return value as ServerMessage;
  if (value.type === "world.object" && isWorldObjectState(value.payload.object)) return value as ServerMessage;
  if (value.type === "world.action" && typeof value.payload.objectId === "string" && typeof value.payload.actionId === "string" && typeof value.payload.message === "string") return value as ServerMessage;
  if (value.type === "skill.locked" && typeof value.payload.skillId === "string" && isSkillLock(value.payload.lock) && isSurvivalState(value.payload.survival)) return value as ServerMessage;
  if (value.type === "item.eaten" && typeof value.payload.itemId === "string" && typeof value.payload.message === "string" && isSurvivalState(value.payload.survival)) return value as ServerMessage;
  if (value.type === "item.equipped" && (typeof value.payload.itemId === "string" || value.payload.itemId === null) && typeof value.payload.slot === "string" && isSurvivalState(value.payload.survival)) return value as ServerMessage;
  if (value.type === "craft.result" && typeof value.payload.recipeId === "string" && typeof value.payload.success === "boolean" && typeof value.payload.message === "string" && isSurvivalState(value.payload.survival)) return value as ServerMessage;
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
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && isCharacterGender(value.gender) && typeof value.createdAt === "string" && isPosition(value.position) && isSurvivalState(value.survival);
}

function isCharacterGender(value: unknown): value is CharacterGender {
  return value === "female" || value === "male";
}

function isWorldObjectState(value: unknown): value is WorldObjectState {
  if (!isRecord(value) || typeof value.zoneId !== "string" || typeof value.objectId !== "string") return false;
  if (value.kind === "resource") return typeof value.remaining === "number" && typeof value.maximum === "number" && typeof value.exhaustedUntil === "number";
  if (value.kind === "wildlife") return typeof value.health === "number" && typeof value.maximumHealth === "number" && typeof value.defeatedUntil === "number";
  return false;
}

function isSurvivalState(value: unknown): value is SurvivalState {
  if (!isRecord(value) || typeof value.lastMetabolismAt !== "string" || !isRecord(value.nutrition)) return false;
  const nutrition = value.nutrition;
  return ["protein", "fat", "carbohydrate", "iron", "vitaminA", "vitaminC", "vitaminD", "vitaminB12", "calcium", "iodine", "water"].every((key) => typeof nutrition[key] === "number");
}

function isSkillLock(value: unknown): value is SkillLock {
  return value === "up" || value === "down" || value === "locked";
}

function isDirection(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && typeof value.x === "number" && typeof value.y === "number" && Number.isFinite(value.x) && Number.isFinite(value.y) && Math.abs(value.x) <= 1 && Math.abs(value.y) <= 1;
}
