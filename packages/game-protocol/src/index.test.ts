import { describe, expect, it } from "vitest";
import { decodeClientMessage, decodeServerMessage, encodeMessage, type ServerMessage } from "./index";

describe("game protocol", () => {
  it("round-trips a valid client hello", () => {
    const message = { type: "connection.hello", requestId: "abc", payload: { clientVersion: "0.1.0" } } as const;
    expect(decodeClientMessage(encodeMessage(message))).toEqual(message);
  });

  it("rejects malformed and unknown messages", () => {
    expect(decodeClientMessage("not-json")).toBeNull();
    expect(decodeServerMessage(JSON.stringify({ type: "unknown", requestId: "1", payload: {} }))).toBeNull();
  });

  it("validates character lifecycle messages", () => {
    const create = { type: "character.create", requestId: "character-1", payload: { name: "에린 Vale" } } as const;
    expect(decodeClientMessage(encodeMessage(create))).toEqual(create);
    const list: ServerMessage = { type: "character.list", requestId: "character-2", payload: { characters: [{ id: "one", name: "에린 Vale", position: { zoneId: "mossward", x: 10, y: 20 }, createdAt: "2026-08-16T00:00:00.000Z", survival: { nutrition: { protein: 80, fat: 80, carbohydrate: 80, iron: 80, vitaminA: 80, vitaminC: 80, vitaminD: 80, vitaminB12: 80, calcium: 80, iodine: 80, water: 80 }, lastMetabolismAt: "2026-08-16T00:00:00.000Z" } }] } };
    expect(decodeServerMessage(encodeMessage(list))).toEqual(list);
  });
});
