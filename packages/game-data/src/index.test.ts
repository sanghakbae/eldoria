import { describe, expect, it } from "vitest";
import { calculateDifficultyFactor, calculateMiningYield, calculateSkillDamage, calculateSkillGain, calculateSkillInterval, calculateSkillYield, calculateSuccessChance, craftingRecipes, defaultSkillProgression, evaluateBodyConditions, findSkillForAction, foodCatalog, getZoneDefinition, initialNutrition, isPositionWalkable, parseWorldDefinition, resolveSkillAction, skillCategories, skillSystemDefinition, toolDefinitions, worldDefinition } from "./index";

describe("zone collision data", () => {
  it("blocks the Mossward river while leaving open meadow walkable", () => {
    expect(isPositionWalkable("mossward", 350, 400)).toBe(false);
    expect(isPositionWalkable("mossward", 900, 700)).toBe(true);
  });

  it("treats placed trees and water as solid ground", () => {
    const pear = getZoneDefinition("untamedWilds")!.layers.objects.find((object) => object.id === "wilds.wild-pear")!;
    const pond = getZoneDefinition("untamedWilds")!.layers.objects.find((object) => object.type === "fishingWater")!;
    expect(isPositionWalkable("untamedWilds", pear.x, pear.y)).toBe(false);
    expect(isPositionWalkable("untamedWilds", pear.x + 60, pear.y)).toBe(true);
    expect(isPositionWalkable("untamedWilds", pond.x, pond.y)).toBe(false);
    expect(isPositionWalkable("untamedWilds", pond.x - 125, pond.y)).toBe(false);
    expect(isPositionWalkable("untamedWilds", pond.x + 125, pond.y)).toBe(false);
    expect(isPositionWalkable("untamedWilds", pond.x, pond.y + 90)).toBe(false);
    expect(isPositionWalkable("untamedWilds", pond.x - 340, pond.y)).toBe(true);
    // The spawn must never open inside an obstacle, or the wanderer starts wedged.
    expect(isPositionWalkable("untamedWilds", 836, 470)).toBe(true);
  });

  it("keeps the wilds river solid until the player builds a bridge", () => {
    expect(isPositionWalkable("untamedWilds", 320, 240)).toBe(false);
    expect(isPositionWalkable("untamedWilds", 320, 304)).toBe(false);
    expect(isPositionWalkable("untamedWilds", 288, 656)).toBe(false);
  });

  it("rejects positions outside known zones", () => {
    expect(isPositionWalkable("unknown", 10, 10)).toBe(false);
    expect(isPositionWalkable("greythorn", -1, 400)).toBe(false);
  });

  it("connects all 100 surface regions through reciprocal cardinal exits", () => {
    const surface = worldDefinition.zones.filter((zone) => zone.id !== "animalDen");
    expect(surface).toHaveLength(100);
    const opposite = { north: "south", east: "west", south: "north", west: "east" } as const;
    for (const zone of surface) {
      for (const exit of zone.exits) {
        const destination = getZoneDefinition(exit.toZoneId);
        expect(destination?.layers.spawn.some((spawn) => spawn.id === exit.toSpawnId)).toBe(true);
        expect(destination?.exits.some((candidate) => candidate.edge === opposite[exit.edge] && candidate.toZoneId === zone.id)).toBe(true);
      }
    }
  });

  it("loads validated 32 pixel tile layers from content data", () => {
    expect(worldDefinition.tileSize).toBe(32);
    expect(getZoneDefinition("mossward")).toMatchObject({ columns: 53, rows: 30, layers: { terrain: { assetId: "world.mossward" } } });
  });

  it("defines regional ecology with common wood and stone but sparse ore", () => {
    const wilds = getZoneDefinition("untamedWilds");
    const forest = getZoneDefinition("greythorn");
    const marsh = getZoneDefinition("amberfen");

    expect(wilds?.ecology).toMatchObject({ biome: "primordial-coast", hydrology: { type: "coastal-river" } });
    expect(wilds?.ecology.wildFruits).toContain("crabapple");
    expect(forest?.ecology).toMatchObject({ biome: "temperate-forest", hydrology: { type: "forest-creek" } });
    expect(marsh?.ecology).toMatchObject({ biome: "wetland-marsh", hydrology: { type: "marsh-channel" } });
    expect(new Set(worldDefinition.zones.map((zone) => zone.ecology.wildFruits.join(","))).size).toBeGreaterThan(3);
    expect(wilds?.layers.objects.map((object) => object.type)).toEqual(expect.arrayContaining(["wildFruitTree", "wildTree", "fishingWater", "wildlifeSpawnRabbit", "wildlifeSpawnDeer", "wildlifeSpawnBoar"]));
    const surfaceZones = worldDefinition.zones.filter((zone) => zone.id !== "animalDen");
    const surfaceTypes = surfaceZones.flatMap((zone) => zone.layers.objects.map((object) => object.type));
    expect(surfaceTypes.every((type) => type === "wildFruitTree" || type === "wildTree" || type === "looseStone" || type === "stoneOutcrop" || type === "fallenBranch" || type === "fishingWater" || type === "riverFishingWater" || type === "animalDenEntrance" || type.endsWith("OreDeposit") || type === "coalDeposit" || type.startsWith("wildlifeSpawn") || type.startsWith("ambientBirdFlock"))).toBe(true);
    for (const zone of surfaceZones) {
      expect(zone.layers.objects.some((object) => object.type === "wildTree")).toBe(true);
      expect(zone.layers.objects.some((object) => object.type === "looseStone")).toBe(true);
      expect(zone.layers.objects.some((object) => object.type.startsWith("ambientBirdFlock"))).toBe(true);
    }
    expect(new Set(surfaceZones.flatMap((zone) => zone.ecology.hydrology.fishHabitats)).size).toBeGreaterThanOrEqual(12);
    expect(surfaceZones.filter((zone) => zone.layers.objects.some((object) => object.type.endsWith("OreDeposit") || object.type === "coalDeposit")).length).toBeLessThan(surfaceZones.length);
    expect(new Set(wilds?.layers.objects.filter((object) => object.type.startsWith("wildlifeSpawn")).map((object) => object.type)).size).toBeGreaterThanOrEqual(11);
    expect(getZoneDefinition("animalDen")).toMatchObject({ layers: { terrain: { assetId: "world.animalDen" }, objects: expect.arrayContaining([expect.objectContaining({ type: "animalDenExit" })]) } });
  });

  it("anchors the starting-zone fish and cave to the painted terrain features", () => {
    const objects = getZoneDefinition("untamedWilds")!.layers.objects;
    const water = objects.filter((object) => object.type === "fishingWater" || object.type === "riverFishingWater");
    const entrances = objects.filter((object) => object.type === "animalDenEntrance");

    expect(water).toEqual([expect.objectContaining({ type: "fishingWater", x: 1340, y: 342 })]);
    expect(entrances).toEqual([expect.objectContaining({ x: 385, y: 210 })]);
  });

  it("keeps trees, loose materials, and ore deposits out of ponds and rivers", () => {
    const waterRadius: Record<string, { x: number; y: number }> = {
      fishingWater: { x: 165, y: 110 },
      riverFishingWater: { x: 135, y: 90 },
    };
    const clearance: Record<string, number> = {
      wildTree: 72,
      wildFruitTree: 76,
      looseStone: 60,
      fallenBranch: 48,
      copperOreDeposit: 96,
      coalDeposit: 96,
      ironOreDeposit: 96,
    };
    for (const zone of worldDefinition.zones) {
      const waters = zone.layers.objects.filter((object) => waterRadius[object.type]);
      for (const object of zone.layers.objects.filter((candidate) => clearance[candidate.type])) {
        for (const water of waters) {
          const radius = waterRadius[water.type]!;
          const margin = clearance[object.type]!;
          const dx = (object.x - water.x) / (radius.x + margin);
          const dy = (object.y - water.y) / (radius.y + margin);
          expect(dx * dx + dy * dy, `${zone.id}: ${object.id} overlaps ${water.id}`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("rejects malformed world content before the server starts", () => {
    expect(() => parseWorldDefinition({ worldId: "broken", tileSize: 32, zones: [{ id: "bad" }] })).toThrow("Invalid zone");
  });
});

describe("survival skill system", () => {
  it("loads the GDD's 41 skills and cap rules", () => {
    expect(defaultSkillProgression).toHaveLength(41);
    expect(skillSystemDefinition).toMatchObject({ totalSkillCap: 720, individualSkillCap: 120 });
    expect(findSkillForAction("bow.shot")?.id).toBe("hunting");
    expect(craftingRecipes.every((recipe) => findSkillForAction(recipe.actionId))).toBe(true);
  });

  it("scales yield, damage, and action time with the relevant skill", () => {
    expect(calculateSkillYield(1, 0, 40)).toBe(1);
    expect(calculateSkillYield(1, 80, 40)).toBe(3);
    expect(calculateSkillDamage(10, 0)).toBe(8);
    expect(calculateSkillDamage(10, 120)).toBe(14);
    expect(calculateSkillInterval(2_000, 0)).toBe(2_000);
    expect(calculateSkillInterval(2_000, 120)).toBe(1_200);
  });

  it("applies the adjustable gain only after the configured action count", () => {
    const bowHunting = { ...findSkillForAction("bow.shot")!, actionsPerGain: 10, gainAmount: 0.1 };
    expect(calculateSkillGain({ skill: bowHunting, completedActions: 9, currentValue: 0, totalSkillValue: 0, difficultyFactor: 1 })).toBe(0);
    expect(calculateSkillGain({ skill: bowHunting, completedActions: 10, currentValue: 0, totalSkillValue: 0, difficultyFactor: 1 })).toBe(0.1);
    expect(calculateSkillGain({ skill: bowHunting, completedActions: 20, currentValue: 100, totalSkillValue: 100, difficultyFactor: 1 })).toBe(0);
  });

  it("groups every skill under one of the eight design fields and marks the nine MVP skills", () => {
    expect(skillCategories).toHaveLength(8);
    expect(defaultSkillProgression.every((skill) => skillCategories.some((category) => category.id === skill.category))).toBe(true);
    expect(defaultSkillProgression.filter((skill) => skill.mvp).map((skill) => skill.id)).toEqual(["observation", "foraging", "firecraft", "toolmaking", "hunting", "butchery", "cooking", "shelter", "firstAid"]);
  });

  it("combines pickaxe material and mining skill when calculating each mining yield", () => {
    expect(calculateMiningYield("tool.pickaxe", 0)).toBe(1);
    expect(calculateMiningYield("tool.copper-pickaxe", 30)).toBe(3);
    expect(calculateMiningYield("tool.iron-pickaxe", 90)).toBe(6);
    expect(calculateMiningYield("tool.steel-pickaxe", 120)).toBe(8);
    expect(calculateMiningYield("tool.hand-axe", 120)).toBe(0);
  });
});

describe("crafting catalog", () => {
  it("provides ten material tiers for every requested tool family", () => {
    for (const family of ["axe", "pickaxe", "dagger", "longsword", "fishing-rod", "bow", "spear"]) {
      expect(toolDefinitions.filter((tool) => tool.itemId.endsWith(`-${family}`) && !["tool.hand-axe"].includes(tool.itemId))).toHaveLength(10);
    }
  });

  it("includes a player-built shelter recipe", () => {
    expect(craftingRecipes.find((recipe) => recipe.id === "shelter.log-house")).toMatchObject({ output: { itemId: "structure.log-shelter" } });
    expect(craftingRecipes.find((recipe) => recipe.id === "shelter.wood-bridge")).toMatchObject({ output: { itemId: "structure.wood-bridge" } });
  });
});

describe("action success curve", () => {
  it("keeps every action attemptable and follows the documented odds", () => {
    expect(calculateSuccessChance({ skillValue: 0, difficulty: 0 })).toBeCloseTo(0.05, 5);
    expect(calculateSuccessChance({ skillValue: 10, difficulty: 0 })).toBeCloseTo(0.15, 5);
    expect(calculateSuccessChance({ skillValue: 50, difficulty: 0 })).toBeCloseTo(0.6, 5);
    expect(calculateSuccessChance({ skillValue: 100, difficulty: 0 })).toBeCloseTo(0.95, 5);
    expect(calculateSuccessChance({ skillValue: 120, difficulty: 0 })).toBeCloseTo(0.99, 5);
  });

  it("shifts the curve down for actions harder than the skill", () => {
    expect(calculateSuccessChance({ skillValue: 50, difficulty: 40 })).toBeCloseTo(calculateSuccessChance({ skillValue: 10, difficulty: 0 }), 5);
    expect(calculateSuccessChance({ skillValue: 10, difficulty: 65 })).toBeCloseTo(0.05, 5);
  });

  it("lets an action floor override the curve for work that skill does not gate", () => {
    expect(calculateSuccessChance({ skillValue: 0, difficulty: 5, floor: 1 })).toBe(1);
    expect(calculateSuccessChance({ skillValue: 0, difficulty: 5, floor: 0.2 })).toBeCloseTo(0.2, 5);
    // A floor never drags a practised hand back down.
    expect(calculateSuccessChance({ skillValue: 100, difficulty: 0, floor: 0.2 })).toBeCloseTo(0.95, 5);
  });

  it("stops teaching actions that sit far below the current skill", () => {
    expect(calculateDifficultyFactor({ skillValue: 90, difficulty: 20 })).toBe(0);
    expect(calculateDifficultyFactor({ skillValue: 20, difficulty: 20 })).toBe(1);
    expect(calculateDifficultyFactor({ skillValue: 20, difficulty: 60 })).toBe(2);
  });
});

describe("skill action resolution", () => {
  const firecraft = { ...findSkillForAction("fire.ignite")!, actionsPerGain: 1, gainAmount: 1 };

  it("resolves the outcome from the roll and counts failed attempts as practice", () => {
    const failed = resolveSkillAction({ skill: firecraft, skills: {}, roll: 0.99 });
    expect(failed.success).toBe(false);
    expect(failed.skills.firecraft).toMatchObject({ completedActions: 1 });
    expect(failed.skills.firecraft!.value).toBeGreaterThan(0);

    expect(resolveSkillAction({ skill: firecraft, skills: { firecraft: { value: 110, completedActions: 5 } }, roll: 0.5 }).success).toBe(true);
  });

  it("never fails an action whose floor marks it as certain, and still counts the practice", () => {
    const foraging = { ...findSkillForAction("fruit.gather")!, actionsPerGain: 1, gainAmount: 1 };
    const result = resolveSkillAction({ skill: foraging, skills: {}, roll: 0.999, successFloor: 1 });
    expect(result.success).toBe(true);
    expect(result.skills.foraging).toMatchObject({ completedActions: 1 });
    expect(result.gain).toBeGreaterThan(0);
  });

  it("refuses growth unless the skill is set to rise", () => {
    for (const lock of ["locked", "down"] as const) {
      const result = resolveSkillAction({ skill: firecraft, skills: { firecraft: { value: 12, completedActions: 3 } }, locks: { firecraft: lock }, roll: 0.01 });
      expect(result.gain).toBe(0);
      expect(result.skills.firecraft).toEqual({ value: 12, completedActions: 4 });
    }
  });

  it("funds growth from a skill marked down once the total cap is reached", () => {
    const result = resolveSkillAction({
      skill: firecraft,
      skills: { firecraft: { value: 20, completedActions: 9 }, pottery: { value: 700, completedActions: 900 } },
      locks: { pottery: "down" },
      roll: 0.01,
    });
    expect(result.gain).toBeGreaterThan(0);
    expect(result.drained).toEqual([{ skillId: "pottery", amount: result.gain }]);
    expect(result.skills.firecraft!.value + result.skills.pottery!.value).toBeCloseTo(720, 6);
  });

  it("holds the total at the cap when nothing is marked down", () => {
    const result = resolveSkillAction({
      skill: firecraft,
      skills: { firecraft: { value: 20, completedActions: 9 }, pottery: { value: 700, completedActions: 900 } },
      roll: 0.01,
    });
    expect(result.gain).toBe(0);
    expect(result.drained).toEqual([]);
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
