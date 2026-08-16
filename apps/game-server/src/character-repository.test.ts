import { describe, expect, it } from "vitest";
import { CharacterRepositoryError, MAX_CHARACTERS_PER_ACCOUNT, MemoryCharacterRepository, validateCharacterName } from "./character-repository";

describe("character repository rules", () => {
  it("normalizes valid original character names and rejects invalid names", () => {
    expect(validateCharacterName("  에린   Vale  ")).toBe("에린 Vale");
    expect(() => validateCharacterName("<script>")).toThrow(CharacterRepositoryError);
  });

  it("lists only owned characters and persists position checkpoints", async () => {
    const repository = new MemoryCharacterRepository();
    const character = await repository.create("owner-a", "Eldren", "male");
    await repository.create("owner-b", "Mira", "female");
    await repository.savePosition("owner-a", character.id, { zoneId: "greythorn", x: 120, y: 330 });
    expect(await repository.list("owner-a")).toEqual([{ ...character, position: { zoneId: "greythorn", x: 120, y: 330 } }]);
    expect(await repository.getOwned("owner-b", character.id)).toBeNull();
  });

  it("enforces the per-account character limit", async () => {
    const repository = new MemoryCharacterRepository();
    for (let index = 0; index < MAX_CHARACTERS_PER_ACCOUNT; index += 1) await repository.create("owner", `Hero ${index}`, "male");
    await expect(repository.create("owner", "One Too Many", "female")).rejects.toMatchObject({ code: "character.limit" });
  });
});
