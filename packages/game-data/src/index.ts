import worldContent from "@eldoria/content/zones" with { type: "json" };
import nutritionContent from "@eldoria/content/nutrition" with { type: "json" };
import foodContent from "@eldoria/content/foods" with { type: "json" };
import skillContent from "@eldoria/content/skills" with { type: "json" };

export type SkillProgressionConfig = { id: string; name: { en: string; ko: string }; actionsPerGain: number; gainAmount: number; actionIds: string[] };
export type SkillSystemDefinition = { totalSkillCap: number; individualSkillCap: number; curveExponent: number; skills: SkillProgressionConfig[] };
export const skillSystemDefinition = parseSkillProgression(skillContent);
export const defaultSkillProgression = skillSystemDefinition.skills;

function parseSkillProgression(value: unknown): SkillSystemDefinition {
  if (!isRecord(value) || !Array.isArray(value.skills) || !isPositiveNumber(value.totalSkillCap) || !isPositiveNumber(value.individualSkillCap) || !isPositiveNumber(value.curveExponent)) throw new Error("Invalid skill progression content.");
  const skills = value.skills.map((skill, index) => {
    if (!isRecord(skill) || typeof skill.id !== "string" || !isLocalizedName(skill.name) || !isPositiveInteger(skill.actionsPerGain) || !isPositiveNumber(skill.gainAmount) || !Array.isArray(skill.actionIds) || !skill.actionIds.every((actionId) => typeof actionId === "string")) throw new Error(`Invalid skill progression at index ${index}.`);
    return { id: skill.id, name: skill.name, actionsPerGain: skill.actionsPerGain, gainAmount: skill.gainAmount, actionIds: skill.actionIds };
  });
  if (skills.length !== 40) throw new Error("The survival skill system requires exactly 40 skills.");
  return { totalSkillCap: value.totalSkillCap, individualSkillCap: value.individualSkillCap, curveExponent: value.curveExponent, skills };
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

export function createInitialSurvivalState(now = new Date().toISOString()) {
  return { nutrition: { ...initialNutrition }, lastMetabolismAt: now, inventory: [], skills: {} };
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

export function isPositionWalkable(zoneId: string, x: number, y: number): boolean {
  const zone = zones.get(zoneId);
  if (!zone || x < 0 || y < 0 || x >= zone.width || y >= zone.height) return false;
  const tileX = Math.floor(x / zone.tileSize);
  const tileY = Math.floor(y / zone.tileSize);
  return !zone.layers.collision.some((rectangle) => tileX >= rectangle.x && tileX < rectangle.x + rectangle.width && tileY >= rectangle.y && tileY < rectangle.y + rectangle.height);
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
function isPositiveInteger(value: unknown): value is number { return isFiniteNumber(value) && Number.isInteger(value) && value > 0; }
function isNonNegativeInteger(value: unknown): value is number { return isFiniteNumber(value) && Number.isInteger(value) && value >= 0; }
function isLocalizedName(value: unknown): value is { en: string; ko: string } { return isRecord(value) && typeof value.en === "string" && typeof value.ko === "string"; }
function isEdge(value: unknown): value is ZoneExit["edge"] { return value === "north" || value === "east" || value === "south" || value === "west"; }
function isEcology(value: unknown): value is ZoneDefinition["ecology"] { return isRecord(value) && typeof value.biome === "string" && isRecord(value.hydrology) && typeof value.hydrology.type === "string" && Array.isArray(value.hydrology.fishHabitats) && value.hydrology.fishHabitats.every((habitat) => typeof habitat === "string") && Array.isArray(value.wildFruits) && value.wildFruits.every((fruit) => typeof fruit === "string"); }
function isAcquisitionMethod(value: unknown): value is FoodDefinition["acquisitionMethods"][number] { return value === "fishing" || value === "hunting" || value === "trapping" || value === "gathering"; }
function isFoodCategory(value: unknown): value is FoodDefinition["category"] { return value === "fish" || value === "bird" || value === "meat" || value === "vegetable" || value === "fruit"; }
