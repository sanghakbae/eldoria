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
    const create = { type: "character.create", requestId: "character-1", payload: { name: "에린 Vale", gender: "female" } } as const;
    expect(decodeClientMessage(encodeMessage(create))).toEqual(create);
    const list: ServerMessage = { type: "character.list", requestId: "character-2", payload: { characters: [{ id: "one", name: "에린 Vale", gender: "female", position: { zoneId: "mossward", x: 10, y: 20 }, createdAt: "2026-08-16T00:00:00.000Z", survival: { nutrition: { protein: 80, fat: 80, carbohydrate: 80, iron: 80, vitaminA: 80, vitaminC: 80, vitaminD: 80, vitaminB12: 80, calcium: 80, iodine: 80, water: 80 }, lastMetabolismAt: "2026-08-16T00:00:00.000Z" } }] } };
    expect(decodeServerMessage(encodeMessage(list))).toEqual(list);
  });

  it("validates resource interaction messages", () => {
    const request = { type: "world.interact", requestId: "resource-1", payload: { objectId: "wilds.pond" } } as const;
    expect(decodeClientMessage(encodeMessage(request))).toEqual(request);
    const result: ServerMessage = { type: "world.action", requestId: "resource-1", payload: { objectId: "wilds.pond", actionId: "fishing.cast", message: "Caught a trout.", reward: { itemId: "fish.trout", quantity: 1 } } };
    expect(decodeServerMessage(encodeMessage(result))).toEqual(result);
  });

  it("validates authoritative world object snapshots", () => {
    const observe = { type: "world.observe", requestId: "observe-1", payload: { zoneId: "untamedWilds" } } as const;
    expect(decodeClientMessage(encodeMessage(observe))).toEqual(observe);
    const snapshot: ServerMessage = { type: "world.snapshot", requestId: "observe-1", payload: { zoneId: "untamedWilds", objects: [
      { kind: "resource", zoneId: "untamedWilds", objectId: "wilds.stone-scatter-c", remaining: 0, maximum: 1, exhaustedUntil: Date.now() + 1000 },
      { kind: "wildlife", zoneId: "untamedWilds", objectId: "wilds.wolf-pack", health: 10, maximumHealth: 10, defeatedUntil: 0 },
    ] } };
    expect(decodeServerMessage(encodeMessage(snapshot))).toEqual(snapshot);
  });
});
