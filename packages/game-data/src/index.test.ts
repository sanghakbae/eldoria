import { describe, expect, it } from "vitest";
import { calculateSkillGain, defaultSkillProgression, evaluateBodyConditions, findSkillForAction, foodCatalog, getZoneDefinition, initialNutrition, isPositionWalkable, parseWorldDefinition, skillSystemDefinition, worldDefinition } from "./index";

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

  it("defines distinct regional water and wild fruit ecology", () => {
    const wilds = getZoneDefinition("untamedWilds");
    const forest = getZoneDefinition("greythorn");
    const marsh = getZoneDefinition("amberfen");

    expect(wilds?.ecology).toMatchObject({ biome: "primordial-dry-scrub", hydrology: { type: "pond" } });
    expect(wilds?.ecology.wildFruits).toContain("crabapple");
    expect(forest?.ecology).toMatchObject({ biome: "deep-temperate-forest", hydrology: { type: "river" } });
    expect(marsh?.ecology).toMatchObject({ biome: "warm-marsh", hydrology: { type: "wetland-channels" } });
    expect(new Set(worldDefinition.zones.map((zone) => zone.ecology.wildFruits.join(","))).size).toBeGreaterThan(3);
    expect(wilds?.layers.objects.map((object) => object.type)).toEqual(expect.arrayContaining(["copperOreDeposit", "coalDeposit", "ironOreDeposit", "wildlifeSpawnRabbit", "wildlifeSpawnDeer", "wildlifeSpawnBoar"]));
  });

  it("rejects malformed world content before the server starts", () => {
    expect(() => parseWorldDefinition({ worldId: "broken", tileSize: 32, zones: [{ id: "bad" }] })).toThrow("Invalid zone");
  });
});

describe("survival skill system", () => {
  it("loads the GDD's 40 skills and cap rules", () => {
    expect(defaultSkillProgression).toHaveLength(40);
    expect(skillSystemDefinition).toMatchObject({ totalSkillCap: 720, individualSkillCap: 120 });
    expect(findSkillForAction("bow.shot")?.id).toBe("hunting");
  });

  it("applies the adjustable gain only after the configured action count", () => {
    const bowHunting = { ...findSkillForAction("bow.shot")!, actionsPerGain: 10, gainAmount: 0.1 };
    expect(calculateSkillGain({ skill: bowHunting, completedActions: 9, currentValue: 0, totalSkillValue: 0, difficultyFactor: 1 })).toBe(0);
    expect(calculateSkillGain({ skill: bowHunting, completedActions: 10, currentValue: 0, totalSkillValue: 0, difficultyFactor: 1 })).toBe(0.1);
    expect(calculateSkillGain({ skill: bowHunting, completedActions: 20, currentValue: 100, totalSkillValue: 100, difficultyFactor: 1 })).toBe(0);
  });
});

describe("nutrition content", () => {
  it("contains at least 50 foods in every requested category", () => {
    for (const category of ["fish", "bird", "meat", "vegetable", "fruit"]) expect(foodCatalog.filter((food) => food.category === category)).toHaveLength(50);
  });

  it("allows fish to be obtained through fishing only", () => {
    expect(foodCatalog.filter((food) => food.category === "fish").every((food) => food.acquisitionMethods.length === 1 && food.acquisitionMethods[0] === "fishing")).toBe(true);
  });

  it("maps nutrient deficiencies to affected body regions", () => {
    expect(evaluateBodyConditions({ ...initialNutrition, iron: 8, vitaminB12: 8 })).toEqual(expect.arrayContaining([expect.objectContaining({ id: "anemia", region: "blood", severity: "critical" })]));
    expect(evaluateBodyConditions(initialNutrition)).toEqual([]);
  });
});
