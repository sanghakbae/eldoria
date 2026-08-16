import worldContent from "@eldoria/content/zones" with { type: "json" };
import nutritionContent from "@eldoria/content/nutrition" with { type: "json" };
import foodContent from "@eldoria/content/foods" with { type: "json" };
import skillContent from "@eldoria/content/skills" with { type: "json" };
import recipeContent from "@eldoria/content/recipes" with { type: "json" };
import layerContent from "@eldoria/content/layers" with { type: "json" };

export type SkillCategoryId = "nature" | "fireCraft" | "food" | "shelter" | "material" | "agriculture" | "health" | "civilization";
export type SkillCategoryDefinition = { id: SkillCategoryId; name: { en: string; ko: string } };
export type SkillProgressionConfig = { id: string; category: SkillCategoryId; mvp: boolean; baseDifficulty: number; name: { en: string; ko: string }; actionsPerGain: number; gainAmount: number; actionIds: string[] };
export type SuccessAnchor = { effectiveSkill: number; chance: number };
export type SkillSystemDefinition = { totalSkillCap: number; individualSkillCap: number; curveExponent: number; trivialSkillGap: number; successAnchors: SuccessAnchor[]; categories: SkillCategoryDefinition[]; skills: SkillProgressionConfig[] };

// GDD section 7.1: past 100 a skill only advances for players who have systematised their experience.
export const knowledgeGateValue = 40;

const categoryIds: SkillCategoryId[] = ["nature", "fireCraft", "food", "shelter", "material", "agriculture", "health", "civilization"];

export const skillSystemDefinition = parseSkillProgression(skillContent);
export const defaultSkillProgression = skillSystemDefinition.skills;
export const skillCategories = skillSystemDefinition.categories;

function parseSkillProgression(value: unknown): SkillSystemDefinition {
  if (!isRecord(value) || !Array.isArray(value.skills) || !Array.isArray(value.categories) || !Array.isArray(value.successAnchors) || !isPositiveNumber(value.totalSkillCap) || !isPositiveNumber(value.individualSkillCap) || !isPositiveNumber(value.curveExponent) || !isPositiveNumber(value.trivialSkillGap)) throw new Error("Invalid skill progression content.");
  const categories = value.categories.map((category, index) => {
    if (!isRecord(category) || !isSkillCategoryId(category.id) || !isLocalizedName(category.name)) throw new Error(`Invalid skill category at index ${index}.`);
    return { id: category.id, name: category.name };
  });
  if (categories.length !== categoryIds.length || categoryIds.some((id) => !categories.some((category) => category.id === id))) throw new Error("The survival skill system requires all eight skill categories.");
  const successAnchors = value.successAnchors.map((anchor, index) => {
    if (!isRecord(anchor) || !isFiniteNumber(anchor.effectiveSkill) || !isFiniteNumber(anchor.chance) || anchor.chance <= 0 || anchor.chance > 1) throw new Error(`Invalid success anchor at index ${index}.`);
    return { effectiveSkill: anchor.effectiveSkill, chance: anchor.chance };
  }).sort((left, right) => left.effectiveSkill - right.effectiveSkill);
  if (successAnchors.length < 2) throw new Error("The success curve requires at least two anchors.");
  const skills = value.skills.map((skill, index) => {
    if (!isRecord(skill) || typeof skill.id !== "string" || !isSkillCategoryId(skill.category) || typeof skill.mvp !== "boolean" || !isNonNegativeNumber(skill.baseDifficulty) || !isLocalizedName(skill.name) || !isPositiveInteger(skill.actionsPerGain) || !isPositiveNumber(skill.gainAmount) || !Array.isArray(skill.actionIds) || !skill.actionIds.every((actionId) => typeof actionId === "string")) throw new Error(`Invalid skill progression at index ${index}.`);
    return { id: skill.id, category: skill.category, mvp: skill.mvp, baseDifficulty: skill.baseDifficulty, name: skill.name, actionsPerGain: skill.actionsPerGain, gainAmount: skill.gainAmount, actionIds: skill.actionIds };
  });
  if (skills.length !== 40) throw new Error("The survival skill system requires exactly 40 skills.");
  return { totalSkillCap: value.totalSkillCap, individualSkillCap: value.individualSkillCap, curveExponent: value.curveExponent, trivialSkillGap: value.trivialSkillGap, successAnchors, categories, skills };
}

export function findSkillForAction(actionId: string): SkillProgressionConfig | undefined {
  return defaultSkillProgression.find((skill) => skill.actionIds.includes(actionId));
}

export function calculateSkillGain(input: { skill: SkillProgressionConfig; completedActions: number; currentValue: number; totalSkillValue: number; difficultyFactor: number; knowledgeQualified?: boolean }): number {
  if (input.completedActions <= 0 || input.completedActions % input.skill.actionsPerGain !== 0 || input.currentValue >= skillSystemDefinition.individualSkillCap || input.totalSkillValue >= skillSystemDefinition.totalSkillCap) return 0;
  if (input.currentValue >= 100 && !input.knowledgeQualified) return 0;
  const difficulty = Math.max(0, Math.min(2, input.difficultyFactor));
  const remaining = Math.max(0, 1 - input.currentValue / skillSystemDefinition.individualSkillCap);
  return input.skill.gainAmount * difficulty * remaining ** skillSystemDefinition.curveExponent;
}

/**
 * GDD section 6.1: every action is attemptable at skill 0; mastery only moves the odds along the curve.
 * `floor` raises the bottom of that curve for actions where skill is not the gate — picking ripe fruit
 * within reach is limited by whether you showed up, not by how practised a forager you are.
 */
export function calculateSuccessChance(input: { skillValue: number; difficulty: number; floor?: number }): number {
  const effective = Math.max(0, Math.min(skillSystemDefinition.individualSkillCap, input.skillValue - input.difficulty));
  const anchors = skillSystemDefinition.successAnchors;
  const upperIndex = anchors.findIndex((anchor) => anchor.effectiveSkill >= effective);
  const curve = upperIndex <= 0
    ? anchors[upperIndex === 0 ? 0 : anchors.length - 1]!.chance
    : interpolate(anchors[upperIndex - 1]!, anchors[upperIndex]!, effective);
  return Math.min(1, Math.max(curve, input.floor ?? 0));
}

function interpolate(lower: SuccessAnchor, upper: SuccessAnchor, effective: number): number {
  const span = upper.effectiveSkill - lower.effectiveSkill;
  return span === 0 ? upper.chance : lower.chance + ((effective - lower.effectiveSkill) / span) * (upper.chance - lower.chance);
}

// GDD section 7.1: an action far below the current skill teaches nothing, an action above it teaches more.
export function calculateDifficultyFactor(input: { skillValue: number; difficulty: number }): number {
  const gap = input.skillValue - input.difficulty;
  if (gap <= 0) return 1 + Math.min(1, -gap / skillSystemDefinition.trivialSkillGap);
  return Math.max(0, 1 - gap / skillSystemDefinition.trivialSkillGap);
}

export type SkillLock = "up" | "down" | "locked";
export type SkillProgressRecord = { value: number; completedActions: number };
export type SkillActionResult = {
  success: boolean;
  chance: number;
  difficultyFactor: number;
  gain: number;
  drained: Array<{ skillId: string; amount: number }>;
  skills: Record<string, SkillProgressRecord>;
};

/**
 * Resolves one attempted action: rolls the outcome, records the attempt, and applies growth.
 * Failure still counts as practice (GDD section 7 counts cumulative attempts); only the reward is lost.
 * At the 720 total cap, growth is funded by skills the player marked "down" (GDD section 7.1 skill locks).
 */
export function resolveSkillAction(input: {
  skill: SkillProgressionConfig;
  skills: Record<string, SkillProgressRecord>;
  locks?: Record<string, SkillLock>;
  roll: number;
  difficulty?: number;
  successFloor?: number;
}): SkillActionResult {
  const difficulty = input.difficulty ?? input.skill.baseDifficulty;
  const skills: Record<string, SkillProgressRecord> = Object.fromEntries(Object.entries(input.skills).map(([id, record]) => [id, { ...record }]));
  const current = skills[input.skill.id] ?? { value: 0, completedActions: 0 };
  const chance = calculateSuccessChance({ skillValue: current.value, difficulty, floor: input.successFloor });
  const difficultyFactor = calculateDifficultyFactor({ skillValue: current.value, difficulty });
  const success = input.roll < chance;

  current.completedActions += 1;
  skills[input.skill.id] = current;

  const lock = input.locks?.[input.skill.id] ?? "up";
  const donors = Object.entries(skills)
    .filter(([id]) => id !== input.skill.id && input.locks?.[id] === "down")
    .map(([id, record]) => ({ id, record }))
    .filter((donor) => donor.record.value > 0)
    .sort((left, right) => right.record.value - left.record.value);
  const totalValue = Object.values(skills).reduce((sum, record) => sum + record.value, 0);
  const donorValue = donors.reduce((sum, donor) => sum + donor.record.value, 0);

  // Only a skill marked "up" still climbs: "down" is the donor pool and "locked" is frozen where it stands.
  const requested = lock !== "up" ? 0 : calculateSkillGain({
    skill: input.skill,
    completedActions: current.completedActions,
    currentValue: current.value,
    totalSkillValue: totalValue - donorValue,
    difficultyFactor,
    knowledgeQualified: (skills.knowledge?.value ?? 0) >= knowledgeGateValue,
  });

  const headroom = Math.max(0, skillSystemDefinition.totalSkillCap - totalValue);
  const individualHeadroom = Math.max(0, skillSystemDefinition.individualSkillCap - current.value);
  const drained: SkillActionResult["drained"] = [];
  let gain = Math.min(requested, individualHeadroom, headroom + donorValue);
  let toDrain = Math.max(0, gain - headroom);
  for (const donor of donors) {
    if (toDrain <= 0) break;
    const amount = Math.min(toDrain, donor.record.value);
    donor.record.value -= amount;
    toDrain -= amount;
    drained.push({ skillId: donor.id, amount });
  }
  gain -= toDrain;
  current.value += gain;

  return { success, chance, difficultyFactor, gain, drained, skills };
}

function isSkillCategoryId(value: unknown): value is SkillCategoryId {
  return typeof value === "string" && (categoryIds as string[]).includes(value);
}

/**
 * A character is drawn as a stack of layers that share one walk cycle: body, worn pieces, held tools.
 * Every layer sheet carries the same frame count and baseline, so a layer can be swapped without
 * touching the others. Slots the wearer has nothing in simply draw nothing.
 */
export type EquipmentSlot = "body" | "legs" | "feet" | "torso" | "head" | "offHand" | "mainHand";
export type CharacterLayer = { id: EquipmentSlot; z: number; required: boolean; name: { en: string; ko: string } };
export type CharacterLayerSpec = { frameCount: number; framePadding: number; slots: CharacterLayer[] };

export const characterLayerSpec = parseLayerSpec(layerContent);
export const equipmentSlots = characterLayerSpec.slots.map((slot) => slot.id);

export function isEquipmentSlot(value: unknown): value is EquipmentSlot {
  return typeof value === "string" && (equipmentSlots as string[]).includes(value);
}

function parseLayerSpec(value: unknown): CharacterLayerSpec {
  if (!isRecord(value) || !isPositiveInteger(value.frameCount) || !isRecord(value.sheetSpec) || !isPositiveInteger(value.sheetSpec.framePadding) || !Array.isArray(value.slots)) throw new Error("Invalid character layer content.");
  const slots = value.slots.map((slot, index) => {
    if (!isRecord(slot) || typeof slot.id !== "string" || !isNonNegativeNumber(slot.z) || typeof slot.required !== "boolean" || !isLocalizedName(slot.name)) throw new Error(`Invalid character layer at index ${index}.`);
    return { id: slot.id as EquipmentSlot, z: slot.z, required: slot.required, name: slot.name };
  }).sort((left, right) => left.z - right.z);
  if (!slots.some((slot) => slot.id === "body" && slot.required)) throw new Error("The character rig needs a required body layer.");
  return { frameCount: value.frameCount, framePadding: value.sheetSpec.framePadding, slots };
}

export type ItemStack = { itemId: string; quantity: number };
export type CraftingRecipe = {
  id: string;
  name: { en: string; ko: string };
  /** Which skill the attempt trains, resolved through the same action table as world interactions. */
  actionId: string;
  difficulty: number;
  successFloor: number;
  inputs: ItemStack[];
  output: ItemStack;
};
export type ToolDefinition = { itemId: string; name: { en: string; ko: string }; slot: EquipmentSlot; huntingBonus: number; damage: number; durability: number };

export const craftingRecipes = parseRecipes(recipeContent);
export const toolDefinitions = parseTools(recipeContent);

export function findRecipe(recipeId: string): CraftingRecipe | undefined {
  return craftingRecipes.find((recipe) => recipe.id === recipeId);
}

export function findTool(itemId: string): ToolDefinition | undefined {
  return toolDefinitions.find((tool) => tool.itemId === itemId);
}

function parseRecipes(value: unknown): CraftingRecipe[] {
  if (!isRecord(value) || !Array.isArray(value.recipes)) throw new Error("Invalid crafting content.");
  return value.recipes.map((recipe, index) => {
    if (!isRecord(recipe) || typeof recipe.id !== "string" || !isLocalizedName(recipe.name) || typeof recipe.actionId !== "string" || !isNonNegativeNumber(recipe.difficulty) || !isNonNegativeNumber(recipe.successFloor) || !Array.isArray(recipe.inputs) || !isItemStack(recipe.output)) throw new Error(`Invalid recipe at index ${index}.`);
    const inputs = recipe.inputs.map((input) => {
      if (!isItemStack(input)) throw new Error(`Invalid recipe input in ${recipe.id}.`);
      return { itemId: input.itemId, quantity: input.quantity };
    });
    if (inputs.length === 0) throw new Error(`Recipe ${recipe.id} needs at least one input.`);
    return { id: recipe.id, name: recipe.name, actionId: recipe.actionId, difficulty: recipe.difficulty, successFloor: recipe.successFloor, inputs, output: { itemId: recipe.output.itemId, quantity: recipe.output.quantity } };
  });
}

function parseTools(value: unknown): ToolDefinition[] {
  if (!isRecord(value) || !Array.isArray(value.tools)) throw new Error("Invalid tool content.");
  return value.tools.map((tool, index) => {
    if (!isRecord(tool) || typeof tool.itemId !== "string" || !isLocalizedName(tool.name) || !isNonNegativeNumber(tool.huntingBonus) || !isPositiveInteger(tool.damage) || !isPositiveInteger(tool.durability)) throw new Error(`Invalid tool at index ${index}.`);
    return { itemId: tool.itemId, name: tool.name, slot: isEquipmentSlot(tool.slot) ? tool.slot : "mainHand", huntingBonus: tool.huntingBonus, damage: tool.damage, durability: tool.durability };
  });
}

function isItemStack(value: unknown): value is ItemStack {
  return isRecord(value) && typeof value.itemId === "string" && isPositiveInteger(value.quantity);
}

export const nutrientIds = ["protein", "fat", "carbohydrate", "iron", "vitaminA", "vitaminC", "vitaminD", "vitaminB12", "calcium", "iodine", "water"] as const;
export type NutrientId = (typeof nutrientIds)[number];
export type NutritionState = Record<NutrientId, number>;
export type BodyCondition = {
  id: string;
  region: string;
  nutrients: NutrientId[];
  severity: "strained" | "critical";
  name: { en: string; ko: string };
  effect: { en: string; ko: string };
};
export type FoodDefinition = {
  id: string;
  category: "fish" | "bird" | "meat" | "vegetable" | "fruit";
  categoryName: { en: string; ko: string };
  name: { en: string; ko: string };
  edibleParts: string[];
  acquisitionMethods: Array<"fishing" | "hunting" | "trapping" | "gathering">;
  nutrients: NutritionState;
  bodyBenefits: string[];
};

export const initialNutrition: NutritionState = Object.fromEntries(nutrientIds.map((id) => [id, 80])) as NutritionState;
export const foodCatalog = parseFoodCatalog(foodContent);

export const MAXIMUM_HEALTH = 100;

export function createInitialSurvivalState(now = new Date().toISOString()) {
  return { nutrition: { ...initialNutrition }, lastMetabolismAt: now, inventory: [], skills: {}, locks: {}, health: { current: MAXIMUM_HEALTH, maximum: MAXIMUM_HEALTH } };
}

export function evaluateBodyConditions(nutrition: NutritionState): BodyCondition[] {
  const content = nutritionContent as { conditions: Array<{ id: string; region: string; nutrients: NutrientId[]; threshold: number; name: { en: string; ko: string }; effect: { en: string; ko: string } }> };
  return content.conditions.flatMap((condition) => {
    const lowest = Math.min(...condition.nutrients.map((nutrient) => nutrition[nutrient]));
    return lowest < condition.threshold ? [{ ...condition, severity: lowest < condition.threshold * 0.48 ? "critical" as const : "strained" as const }] : [];
  });
}

function parseFoodCatalog(value: unknown): FoodDefinition[] {
  if (!isRecord(value) || !Array.isArray(value.foods) || !isRecord(value.counts)) throw new Error("Invalid food catalog envelope.");
  for (const category of ["fish", "bird", "meat", "vegetable", "fruit"]) if (typeof value.counts[category] !== "number" || value.counts[category] < 50) throw new Error(`Food category ${category} requires at least 50 definitions.`);
  return value.foods.map((food, index) => {
    if (!isRecord(food) || typeof food.id !== "string" || !isFoodCategory(food.category) || !isLocalizedName(food.name) || !isLocalizedName(food.categoryName) || !Array.isArray(food.edibleParts) || !food.edibleParts.every((part) => typeof part === "string") || !Array.isArray(food.acquisitionMethods) || !food.acquisitionMethods.every(isAcquisitionMethod) || !isRecord(food.nutrients) || !Array.isArray(food.bodyBenefits) || !food.bodyBenefits.every((region) => typeof region === "string")) throw new Error(`Invalid food definition at index ${index}.`);
    const rawNutrients = food.nutrients;
    const nutrients = Object.fromEntries(nutrientIds.map((id) => {
      const amount = rawNutrients[id];
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) throw new Error(`Invalid ${id} value for food ${food.id}.`);
      return [id, amount];
    })) as NutritionState;
    return { id: food.id, category: food.category, categoryName: food.categoryName, name: food.name, edibleParts: food.edibleParts, acquisitionMethods: food.acquisitionMethods, nutrients, bodyBenefits: food.bodyBenefits };
  });
}

export type TileRectangle = { x: number; y: number; width: number; height: number };
export type ZoneSpawn = { id: string; x: number; y: number };
export type ZoneExit = { edge: "north" | "east" | "south" | "west"; toZoneId: string; toSpawnId: string };
export type ZoneDefinition = {
  id: string;
  name: { en: string; ko: string };
  width: number;
  height: number;
  columns: number;
  rows: number;
  tileSize: number;
  ecology: {
    biome: string;
    hydrology: { type: string; fishHabitats: string[] };
    wildFruits: string[];
  };
  layers: {
    terrain: { assetId: string };
    collision: TileRectangle[];
    objects: Array<{ id: string; type: string; x: number; y: number }>;
    spawn: ZoneSpawn[];
  };
  exits: ZoneExit[];
};

export type WorldDefinition = { worldId: string; tileSize: number; zones: ZoneDefinition[] };

export const worldDefinition = parseWorldDefinition(worldContent);
const zones = new Map(worldDefinition.zones.map((zone) => [zone.id, zone]));

export function getZoneDefinition(zoneId: string): ZoneDefinition | undefined {
  return zones.get(zoneId);
}

/**
 * Placed world objects are solid, not decals: a trunk, a boulder and a pond turn a walker aside the
 * same way a collision tile does. The footprint is an ellipse because the camera looks down at a
 * slant, so the ground a thing covers is wider than it is deep. Radii are in zone pixels.
 */
const OBSTACLE_FOOTPRINTS: Record<string, { rx: number; ry: number }> = {
  looseStone: { rx: 14, ry: 9 },
  wildTree: { rx: 30, ry: 18 },
  wildFruitTree: { rx: 32, ry: 20 },
  fishingWater: { rx: 76, ry: 42 },
  copperOreDeposit: { rx: 30, ry: 18 },
  coalDeposit: { rx: 30, ry: 18 },
  ironOreDeposit: { rx: 30, ry: 18 },
};

export function isPositionWalkable(zoneId: string, x: number, y: number): boolean {
  const zone = zones.get(zoneId);
  if (!zone || x < 0 || y < 0 || x >= zone.width || y >= zone.height) return false;
  const tileX = Math.floor(x / zone.tileSize);
  const tileY = Math.floor(y / zone.tileSize);
  if (zone.layers.collision.some((rectangle) => tileX >= rectangle.x && tileX < rectangle.x + rectangle.width && tileY >= rectangle.y && tileY < rectangle.y + rectangle.height)) return false;
  return !zone.layers.objects.some((object) => {
    const footprint = OBSTACLE_FOOTPRINTS[object.type];
    if (!footprint) return false;
    const dx = (x - object.x) / footprint.rx;
    const dy = (y - object.y) / footprint.ry;
    return dx * dx + dy * dy < 1;
  });
}

export function parseWorldDefinition(value: unknown): WorldDefinition {
  if (!isRecord(value) || typeof value.worldId !== "string" || !isPositiveInteger(value.tileSize) || !Array.isArray(value.zones)) throw new Error("Invalid world content envelope.");
  const tileSize = value.tileSize;
  const parsedZones = value.zones.map((zone, index) => parseZone(zone, tileSize, index));
  const ids = new Set(parsedZones.map((zone) => zone.id));
  if (ids.size !== parsedZones.length) throw new Error("Zone ids must be unique.");
  for (const zone of parsedZones) {
    for (const exit of zone.exits) if (!ids.has(exit.toZoneId)) throw new Error(`Zone ${zone.id} exits to unknown zone ${exit.toZoneId}.`);
  }
  return { worldId: value.worldId, tileSize, zones: parsedZones };
}

function parseZone(value: unknown, tileSize: number, index: number): ZoneDefinition {
  if (!isRecord(value) || typeof value.id !== "string" || !isLocalizedName(value.name) || !isPositiveNumber(value.width) || !isPositiveNumber(value.height) || !isPositiveInteger(value.columns) || !isPositiveInteger(value.rows) || !isEcology(value.ecology) || !isRecord(value.layers) || !isRecord(value.layers.terrain) || typeof value.layers.terrain.assetId !== "string" || !Array.isArray(value.layers.collision) || !Array.isArray(value.layers.objects) || !Array.isArray(value.layers.spawn) || !Array.isArray(value.exits)) throw new Error(`Invalid zone at index ${index}.`);
  const zoneId = value.id;
  const collision = value.layers.collision.map((rectangle, rectangleIndex) => parseTileRectangle(rectangle, zoneId, rectangleIndex));
  const spawn = value.layers.spawn.map((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || !isFiniteNumber(item.x) || !isFiniteNumber(item.y)) throw new Error(`Invalid spawn in zone ${zoneId}.`);
    return { id: item.id, x: item.x, y: item.y };
  });
  const objects = value.layers.objects.map((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.type !== "string" || !isFiniteNumber(item.x) || !isFiniteNumber(item.y)) throw new Error(`Invalid object in zone ${zoneId}.`);
    return { id: item.id, type: item.type, x: item.x, y: item.y };
  });
  const exits = value.exits.map((exit) => {
    if (!isRecord(exit) || !isEdge(exit.edge) || typeof exit.toZoneId !== "string" || typeof exit.toSpawnId !== "string") throw new Error(`Invalid exit in zone ${zoneId}.`);
    return { edge: exit.edge, toZoneId: exit.toZoneId, toSpawnId: exit.toSpawnId };
  });
  return { id: zoneId, name: value.name, width: value.width, height: value.height, columns: value.columns, rows: value.rows, tileSize, ecology: value.ecology, layers: { terrain: { assetId: value.layers.terrain.assetId }, collision, objects, spawn }, exits };
}

function parseTileRectangle(value: unknown, zoneId: string, index: number): TileRectangle {
  if (!isRecord(value) || !isNonNegativeInteger(value.x) || !isNonNegativeInteger(value.y) || !isPositiveInteger(value.width) || !isPositiveInteger(value.height)) throw new Error(`Invalid collision rectangle ${index} in zone ${zoneId}.`);
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function isPositiveNumber(value: unknown): value is number { return isFiniteNumber(value) && value > 0; }
function isNonNegativeNumber(value: unknown): value is number { return isFiniteNumber(value) && value >= 0; }
function isPositiveInteger(value: unknown): value is number { return isFiniteNumber(value) && Number.isInteger(value) && value > 0; }
function isNonNegativeInteger(value: unknown): value is number { return isFiniteNumber(value) && Number.isInteger(value) && value >= 0; }
function isLocalizedName(value: unknown): value is { en: string; ko: string } { return isRecord(value) && typeof value.en === "string" && typeof value.ko === "string"; }
function isEdge(value: unknown): value is ZoneExit["edge"] { return value === "north" || value === "east" || value === "south" || value === "west"; }
function isEcology(value: unknown): value is ZoneDefinition["ecology"] { return isRecord(value) && typeof value.biome === "string" && isRecord(value.hydrology) && typeof value.hydrology.type === "string" && Array.isArray(value.hydrology.fishHabitats) && value.hydrology.fishHabitats.every((habitat) => typeof habitat === "string") && Array.isArray(value.wildFruits) && value.wildFruits.every((fruit) => typeof fruit === "string"); }
function isAcquisitionMethod(value: unknown): value is FoodDefinition["acquisitionMethods"][number] { return value === "fishing" || value === "hunting" || value === "trapping" || value === "gathering"; }
function isFoodCategory(value: unknown): value is FoodDefinition["category"] { return value === "fish" || value === "bird" || value === "meat" || value === "vegetable" || value === "fruit"; }
