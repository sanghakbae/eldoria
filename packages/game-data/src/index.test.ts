import { describe, expect, it } from "vitest";
import { evaluateBodyConditions, foodCatalog, getZoneDefinition, initialNutrition, isPositionWalkable, parseWorldDefinition, worldDefinition } from "./index";

describe("zone collision data", () => {
  it("blocks Mossward buildings while leaving the road open", () => {
    expect(isPositionWalkable("mossward", 700, 200)).toBe(false);
    expect(isPositionWalkable("mossward", 900, 700)).toBe(true);
  });

  it("rejects positions outside known zones", () => {
    expect(isPositionWalkable("unknown", 10, 10)).toBe(false);
    expect(isPositionWalkable("greythorn", -1, 400)).toBe(false);
  });

  it("loads validated 32 pixel tile layers from content data", () => {
    expect(worldDefinition.tileSize).toBe(32);
    expect(getZoneDefinition("mossward")).toMatchObject({ columns: 53, rows: 30, layers: { terrain: { assetId: "world.mossward" } } });
  });

  it("rejects malformed world content before the server starts", () => {
    expect(() => parseWorldDefinition({ worldId: "broken", tileSize: 32, zones: [{ id: "bad" }] })).toThrow("Invalid zone");
  });
});

describe("nutrition content", () => {
  it("contains at least 50 foods in every requested category", () => {
    for (const category of ["fish", "bird", "meat", "vegetable", "fruit"]) expect(foodCatalog.filter((food) => food.category === category)).toHaveLength(50);
  });

  it("maps nutrient deficiencies to affected body regions", () => {
    expect(evaluateBodyConditions({ ...initialNutrition, iron: 8, vitaminB12: 8 })).toEqual(expect.arrayContaining([expect.objectContaining({ id: "anemia", region: "blood", severity: "critical" })]));
    expect(evaluateBodyConditions(initialNutrition)).toEqual([]);
  });
});
