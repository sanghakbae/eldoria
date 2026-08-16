import type { CharacterSummary, Position } from "@eldoria/game-protocol";
import { createInitialSurvivalState } from "@eldoria/game-data";

export const STARTING_POSITION: Position = { zoneId: "untamedWilds", x: 836, y: 470 };
export const MAX_CHARACTERS_PER_ACCOUNT = 5;

export type CharacterRepository = {
  list(ownerUid: string): Promise<CharacterSummary[]>;
  create(ownerUid: string, name: string): Promise<CharacterSummary>;
  getOwned(ownerUid: string, characterId: string): Promise<CharacterSummary | null>;
  savePosition(ownerUid: string, characterId: string, position: Position): Promise<void>;
};

export function validateCharacterName(rawName: string): string {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 20) throw new CharacterRepositoryError("character.invalid_name", "Character names must contain 2 to 20 characters.");
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '\-]*$/u.test(name)) throw new CharacterRepositoryError("character.invalid_name", "Character names contain unsupported characters.");
  return name;
}

export class CharacterRepositoryError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export class MemoryCharacterRepository implements CharacterRepository {
  private readonly characters = new Map<string, CharacterSummary & { ownerUid: string }>();

  async list(ownerUid: string) {
    return [...this.characters.values()].filter((character) => character.ownerUid === ownerUid).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(stripOwner);
  }

  async create(ownerUid: string, rawName: string) {
    const name = validateCharacterName(rawName);
    if ((await this.list(ownerUid)).length >= MAX_CHARACTERS_PER_ACCOUNT) throw new CharacterRepositoryError("character.limit", "The account already has the maximum number of characters.");
    const createdAt = new Date().toISOString();
    const character = { id: crypto.randomUUID(), ownerUid, name, position: { ...STARTING_POSITION }, createdAt, survival: createInitialSurvivalState(createdAt) };
    this.characters.set(character.id, character);
    return stripOwner(character);
  }

  async getOwned(ownerUid: string, characterId: string) {
    const character = this.characters.get(characterId);
    return character?.ownerUid === ownerUid ? stripOwner(character) : null;
  }

  async savePosition(ownerUid: string, characterId: string, position: Position) {
    const character = this.characters.get(characterId);
    if (!character || character.ownerUid !== ownerUid) throw new CharacterRepositoryError("character.not_found", "Character was not found.");
    character.position = { ...position };
  }
}

function stripOwner(character: CharacterSummary & { ownerUid: string }): CharacterSummary {
  return { id: character.id, name: character.name, position: { ...character.position }, createdAt: character.createdAt, survival: { nutrition: { ...character.survival.nutrition }, lastMetabolismAt: character.survival.lastMetabolismAt } };
}
