import Phaser from "phaser";
import { findTool, getZoneDefinition, isPositionWalkable, worldDefinition } from "@eldoria/game-data";
import type { BuiltStructure, WorldObjectState } from "@eldoria/game-protocol";
import { getAssetEntries } from "../assetRegistry";
import { CharacterRig, type LayerSheet } from "../characterRig";
import { equipmentLayerSheets } from "../equipmentLayers";
import { itemDisplayName } from "../itemNames";

const WORLD_WIDTH = 1672;
const WORLD_HEIGHT = 941;
/**
 * The side-on walk sheets do not divide into equal columns either. The male sheet is 2172px for eight
 * poses, so a 271px slice clipped six pixels off the sixth stride; the female poses overlap their
 * nominal boundaries outright, which cut the legs off mid-frame. These are the measured pose bounds.
 * Every pose shares one y band so the figure keeps a stable baseline through the cycle.
 */
const SIDE_WALK_SHEETS = {
  "player.walk": { y: 89, height: 496, poses: [[28, 240], [317, 220], [566, 227], [833, 251], [1104, 252], [1373, 260], [1660, 199], [1911, 232]], strike: { coil: 6, extend: 1 } },
  "player.female.walk": { y: 106, height: 533, poses: [[18, 272], [302, 240], [542, 237], [795, 257], [1052, 267], [1319, 264], [1583, 227], [1838, 253]], strike: { coil: 6, extend: 0 } },
} as const;
/**
 * The wildlife sheet does not divide into equal columns: the stag's antlers reach back across the
 * rabbit's third and the boar's snout crosses into the stag's, so slicing at 512px hung antlers over
 * the rabbit and cut them off the stag. These are the measured bounds of each animal.
 */
type AnimalProfile = {
  key: string;
  label: { en: string; ko: string };
  texture: string;
  displayHeight: number;
  society: "solitary" | "pair" | "herd" | "pack" | "flock" | "colony";
  group: [number, number];
  speed: number;
  stride: [number, number];
  rest: [number, number];
  homeRange: number;
  lift: number;
  aggressive?: boolean;
  flying?: boolean;
};
const ANIMAL_PROFILES: Record<string, AnimalProfile> = {
  wildlifeSpawnRabbit: { key: "rabbit", label: { en: "Rabbit", ko: "토끼" }, texture: "wildlife.walk.rabbit", displayHeight: 36, society: "colony", group: [1, 1], speed: 72, stride: [38, 66], rest: [1400, 3200], homeRange: 170, lift: 9 },
  wildlifeSpawnDeer: { key: "deer", label: { en: "Deer", ko: "사슴" }, texture: "wildlife.walk.deer", displayHeight: 100, society: "herd", group: [1, 1], speed: 31, stride: [52, 84], rest: [3200, 6500], homeRange: 280, lift: 5 },
  wildlifeSpawnBoar: { key: "boar", label: { en: "Wild boar", ko: "멧돼지" }, texture: "wildlife.walk.boar", displayHeight: 78, society: "herd", group: [1, 1], speed: 42, stride: [45, 74], rest: [2200, 4600], homeRange: 230, lift: 6, aggressive: true },
  wildlifeSpawnWolf: { key: "wolf", label: { en: "Wolf", ko: "늑대" }, texture: "wildlife.walk.wolf", displayHeight: 68, society: "pack", group: [1, 1], speed: 58, stride: [55, 92], rest: [1600, 3500], homeRange: 320, lift: 7, aggressive: true },
  wildlifeSpawnFox: { key: "fox", label: { en: "Fox", ko: "여우" }, texture: "wildlife.walk.fox", displayHeight: 62, society: "solitary", group: [1, 1], speed: 62, stride: [48, 82], rest: [2400, 5200], homeRange: 300, lift: 4 },
  wildlifeSpawnBear: { key: "bear", label: { en: "Brown bear", ko: "불곰" }, texture: "wildlife.walk.bear", displayHeight: 130, society: "solitary", group: [1, 1], speed: 34, stride: [38, 65], rest: [4200, 8000], homeRange: 260, lift: 3, aggressive: true },
  wildlifeSpawnBison: { key: "bison", label: { en: "Bison", ko: "들소" }, texture: "wildlife.walk.bison", displayHeight: 124, society: "herd", group: [1, 1], speed: 29, stride: [42, 68], rest: [3500, 6800], homeRange: 250, lift: 5 },
  wildlifeSpawnGoat: { key: "goat", label: { en: "Mountain goat", ko: "산양" }, texture: "wildlife.walk.goat", displayHeight: 72, society: "herd", group: [1, 1], speed: 46, stride: [42, 72], rest: [2200, 4700], homeRange: 240, lift: 7 },
  wildlifeSpawnTurkey: { key: "turkey", label: { en: "Wild turkey", ko: "야생 칠면조" }, texture: "wildlife.walk.turkey", displayHeight: 60, society: "flock", group: [1, 1], speed: 38, stride: [32, 58], rest: [1500, 3800], homeRange: 210, lift: 7 },
  wildlifeSpawnTurtle: { key: "turtle", label: { en: "Pond turtle", ko: "늪거북" }, texture: "wildlife.walk.turtle", displayHeight: 36, society: "colony", group: [1, 1], speed: 12, stride: [16, 30], rest: [4500, 9000], homeRange: 90, lift: 2 },
  wildlifeSpawnHare: { key: "hare", label: { en: "Hare", ko: "산토끼" }, texture: "wildlife.walk.hare", displayHeight: 44, society: "pair", group: [1, 1], speed: 76, stride: [52, 88], rest: [1300, 3000], homeRange: 220, lift: 11 },
};
const BIRD_PROFILES: Record<string, AnimalProfile> = {
  Eagle: { key: "eagle", label: { en: "Eagle", ko: "독수리" }, texture: "wildlife.ambientBird", displayHeight: 62, society: "solitary", group: [1, 1], speed: 96, stride: [90, 140], rest: [0, 0], homeRange: 900, lift: 0, flying: true },
  Hawk: { key: "hawk", label: { en: "Hawk", ko: "매" }, texture: "wildlife.ambientBird", displayHeight: 48, society: "solitary", group: [1, 1], speed: 108, stride: [90, 140], rest: [0, 0], homeRange: 900, lift: 0, flying: true },
  Falcon: { key: "falcon", label: { en: "Falcon", ko: "송골매" }, texture: "wildlife.ambientBird", displayHeight: 46, society: "solitary", group: [1, 1], speed: 116, stride: [90, 140], rest: [0, 0], homeRange: 900, lift: 0, flying: true },
  Vulture: { key: "vulture", label: { en: "Vulture", ko: "독수리" }, texture: "wildlife.ambientBird", displayHeight: 60, society: "pair", group: [1, 1], speed: 82, stride: [90, 140], rest: [0, 0], homeRange: 900, lift: 0, flying: true },
  Crow: { key: "crow", label: { en: "Crow", ko: "까마귀" }, texture: "wildlife.ambientBird", displayHeight: 42, society: "flock", group: [1, 1], speed: 104, stride: [90, 140], rest: [0, 0], homeRange: 900, lift: 0, flying: true },
  Owl: { key: "owl", label: { en: "Owl", ko: "올빼미" }, texture: "wildlife.ambientBird", displayHeight: 48, society: "solitary", group: [1, 1], speed: 88, stride: [90, 140], rest: [0, 0], homeRange: 900, lift: 0, flying: true },
  Gull: { key: "gull", label: { en: "Gull", ko: "갈매기" }, texture: "wildlife.ambientBird", displayHeight: 50, society: "flock", group: [1, 1], speed: 98, stride: [90, 140], rest: [0, 0], homeRange: 900, lift: 0, flying: true },
  Heron: { key: "heron", label: { en: "Heron", ko: "왜가리" }, texture: "wildlife.ambientBird", displayHeight: 54, society: "solitary", group: [1, 1], speed: 76, stride: [90, 140], rest: [0, 0], homeRange: 900, lift: 0, flying: true },
  Crane: { key: "crane", label: { en: "Crane", ko: "두루미" }, texture: "wildlife.ambientBird", displayHeight: 54, society: "pair", group: [1, 1], speed: 78, stride: [90, 140], rest: [0, 0], homeRange: 900, lift: 0, flying: true },
  Parrot: { key: "parrot", label: { en: "Parrot", ko: "앵무새" }, texture: "wildlife.ambientBird", displayHeight: 44, society: "flock", group: [1, 1], speed: 102, stride: [90, 140], rest: [0, 0], homeRange: 900, lift: 0, flying: true },
  Hornbill: { key: "hornbill", label: { en: "Hornbill", ko: "코뿔새" }, texture: "wildlife.ambientBird", displayHeight: 50, society: "pair", group: [1, 1], speed: 92, stride: [90, 140], rest: [0, 0], homeRange: 900, lift: 0, flying: true },
};
const ANIMAL_ORIGIN_Y = 0.98;
const HEALTH_BAR_WIDTH = 34;
// The camera looks down at a slant, so a step north covers less screen than a step east.
const VERTICAL_FORESHORTENING = 0.55;
// Arm's length, near enough that the two figures overlap on screen. Anything wider read as landing
// blows across open ground.
const STRIKE_REACH = 68;
// Once the wanderer is in reach they stay put; only a quarry that has genuinely pulled away is chased
// again. Without this gap the same step was taken and undone every frame, which read as jitter.
const STRIKE_BREAK_OFF = 104;
const STRIKE_INTERVAL_MS = 850;
const DOUBLE_CLICK_MS = 400;
const MINING_INTERVAL_MS = 1900;
const LOCAL_WILDLIFE_RESPAWN_MS = 15_000;
const WALK_STRIDE_DISTANCE = 46;

function isMiningObjectType(type: string | undefined): boolean {
  return type === "stoneOutcrop" || type === "coalDeposit" || Boolean(type?.endsWith("OreDeposit"));
}
/**
 * Where the hand sits in each walk pose, as a fraction of that pose's own box. Measured off the sheets
 * rather than guessed, which is why a held item can ride the arm swing instead of floating beside it.
 */
const HAND_ANCHORS: Record<string, ReadonlyArray<{ fx: number; fy: number; angle: number }>> = {
  "player.walk": [
    { fx: 0.996, fy: 0.46, angle: 0.34 }, { fx: 0.995, fy: 0.474, angle: 0.2 }, { fx: 0.996, fy: 0.468, angle: 0.05 }, { fx: 0.952, fy: 0.514, angle: -0.16 },
    { fx: 0.944, fy: 0.514, angle: -0.3 }, { fx: 0.908, fy: 0.51, angle: -0.18 }, { fx: 0.965, fy: 0.54, angle: 0.06 }, { fx: 0.974, fy: 0.468, angle: 0.24 },
  ],
  "player.female.walk": [
    { fx: 0.996, fy: 0.477, angle: 0.32 }, { fx: 0.996, fy: 0.49, angle: 0.18 }, { fx: 0.987, fy: 0.482, angle: 0.03 }, { fx: 0.957, fy: 0.488, angle: -0.17 },
    { fx: 0.963, fy: 0.501, angle: -0.29 }, { fx: 0.951, fy: 0.497, angle: -0.15 }, { fx: 0.996, fy: 0.531, angle: 0.08 }, { fx: 0.929, fy: 0.486, angle: 0.25 },
  ],
};
// Each side pose was cropped to its own painted bounds. Its visual mass is therefore not always at
// 50% of that crop; compensating the measured alpha centroid prevents the torso from twitching left
// and right while the feet cycle underneath it.
const SIDE_BODY_CENTERS: Record<string, ReadonlyArray<number>> = {
  "player.walk": [0.522, 0.475, 0.55, 0.498, 0.502, 0.483, 0.536, 0.498],
  "player.female.walk": [0.527, 0.496, 0.56, 0.509, 0.502, 0.501, 0.558, 0.519],
};
const VERTICAL_HAND_ANCHORS: ReadonlyArray<{ fx: number; fy: number; angle: number }> = [
  // North/back: the character's right hand is on the viewer's right.
  { fx: 0.91, fy: 0.54, angle: 0.08 }, { fx: 0.9, fy: 0.55, angle: 0.04 }, { fx: 0.89, fy: 0.54, angle: 0 }, { fx: 0.9, fy: 0.52, angle: -0.05 },
  { fx: 0.92, fy: 0.53, angle: -0.08 }, { fx: 0.94, fy: 0.55, angle: -0.04 }, { fx: 0.93, fy: 0.56, angle: 0.02 }, { fx: 0.92, fy: 0.54, angle: 0.06 },
  // South/front: the same anatomical hand appears on the viewer's left.
  { fx: 0.09, fy: 0.55, angle: 0.08 }, { fx: 0.1, fy: 0.57, angle: 0.04 }, { fx: 0.11, fy: 0.56, angle: 0 }, { fx: 0.1, fy: 0.54, angle: -0.05 },
  { fx: 0.08, fy: 0.55, angle: -0.08 }, { fx: 0.06, fy: 0.57, angle: -0.04 }, { fx: 0.07, fy: 0.58, angle: 0.02 }, { fx: 0.08, fy: 0.55, angle: 0.06 },
];
/**
 * Art for things that can be held. Each is a single drawing carried by the hand anchors above.
 * `grip` is where the hand closes on it, as a fraction of the drawing, so an axe hangs from its haft
 * while a spear rides upright with the point above the fist.
 */
const HELD_ITEM_ART: Record<string, { key: string; path?: string; height: number; grip: [number, number]; outwardAngle?: number }> = {
  "tool.hand-axe": { key: "item.stone-axe.v4", path: "/assets/items/stone-axe.svg?v=4", height: 25, grip: [0.23, 0.84] },
  "tool.copper-axe": { key: "item.copper-axe", path: "/assets/items/copper-axe.svg", height: 27, grip: [0.23, 0.84] },
  "tool.iron-axe": { key: "item.iron-axe", path: "/assets/items/iron-axe.svg", height: 28, grip: [0.23, 0.84] },
  "tool.steel-axe": { key: "item.steel-axe", path: "/assets/items/steel-axe.svg", height: 29, grip: [0.23, 0.84] },
  "tool.pickaxe": { key: "item.stone-pickaxe.v3", path: "/assets/items/stone-pickaxe.svg?v=3", height: 40, grip: [0.16, 0.94], outwardAngle: 0.24 },
  "tool.copper-pickaxe": { key: "item.copper-pickaxe", path: "/assets/items/copper-pickaxe.svg", height: 40, grip: [0.16, 0.94], outwardAngle: 0.24 },
  "tool.iron-pickaxe": { key: "item.iron-pickaxe", path: "/assets/items/iron-pickaxe.svg", height: 42, grip: [0.16, 0.94], outwardAngle: 0.24 },
  "tool.steel-pickaxe": { key: "item.steel-pickaxe", path: "/assets/items/steel-pickaxe.svg", height: 43, grip: [0.16, 0.94], outwardAngle: 0.24 },
  "tool.stone-spear": { key: "item.stone-spear", path: "/assets/items/stone-spear.svg", height: 42, grip: [0.5, 0.34] },
  "tool.fishing-rod": { key: "item.fishing-rod", path: "/assets/items/fishing-rod.svg", height: 34, grip: [0.22, 0.9] },
  "family.dagger": { key: "item.dagger", path: "/assets/items/dagger.svg", height: 28, grip: [0.5, 0.82] },
  "family.longsword": { key: "item.longsword", path: "/assets/items/longsword.svg", height: 43, grip: [0.5, 0.84] },
  "family.bow": { key: "item.bow", path: "/assets/items/bow.png?v=2", height: 44, grip: [0.34, 0.5] },
};
function heldItemArt(itemId: string) {
  if (HELD_ITEM_ART[itemId]) return HELD_ITEM_ART[itemId];
  if (itemId.endsWith("-pickaxe")) return HELD_ITEM_ART["tool.pickaxe"];
  if (itemId.endsWith("-axe")) return HELD_ITEM_ART["tool.hand-axe"];
  if (itemId.endsWith("-dagger")) return HELD_ITEM_ART["family.dagger"];
  if (itemId.endsWith("-longsword")) return HELD_ITEM_ART["family.longsword"];
  if (itemId.endsWith("-fishing-rod")) return HELD_ITEM_ART["tool.fishing-rod"];
  if (itemId.endsWith("-bow")) return HELD_ITEM_ART["family.bow"];
  if (itemId.endsWith("-spear")) return HELD_ITEM_ART["tool.stone-spear"];
  return undefined;
}
/** Canvas text is drawn outside the CSS cascade, so the family has to be named here as well. */
const GAME_FONT = '"Apple SD Gothic Neo", "Noto Sans KR", "KoPubWorld Dotum", sans-serif';
/** Painted terrain features still use a geometric hover marker. Resource sprites use their own
 * alpha silhouette instead, so transparent pixels never become part of the visible highlight. */
/**
 * Click and hover regions in zone pixels. An object's coordinate is where it meets the ground, so
 * `offsetY` lifts the region onto the mass the art draws — centring on the anchor put the outline in
 * the dirt below the rock.
 */
const OBJECT_REGIONS: Record<string, { width: number; height: number; offsetY: number }> = {
  fishingWater: { width: 150, height: 78, offsetY: 0 },
  riverFishingWater: { width: 88, height: 54, offsetY: 0 },
  wildTree: { width: 84, height: 118, offsetY: -62 },
  wildFruitTree: { width: 104, height: 116, offsetY: -60 },
  looseStone: { width: 42, height: 26, offsetY: -9 },
  stoneOutcrop: { width: 228, height: 224, offsetY: -112 },
  fallenBranch: { width: 56, height: 22, offsetY: -7 },
  copperOreDeposit: { width: 104, height: 96, offsetY: -50 },
  coalDeposit: { width: 104, height: 96, offsetY: -50 },
  ironOreDeposit: { width: 104, height: 96, offsetY: -50 },
  animalDenEntrance: { width: 116, height: 78, offsetY: -34 },
  animalDenExit: { width: 116, height: 78, offsetY: -34 },
};
const DEFAULT_REGION = { width: 96, height: 72, offsetY: -30 };
const RESOURCE_BAR_WIDTH = 40;
const RESOURCE_ART: Record<string, { texture: string; width: number; height: number; sway?: number; paintedIntoTerrain?: boolean }> = {
  wildTree: { texture: "resource.wildTree", width: 78, height: 172, sway: 0.012 },
  wildFruitTree: { texture: "resource.wildFruitTree", width: 110, height: 114, sway: 0.009 },
  looseStone: { texture: "resource.looseStone", width: 76, height: 55 },
  fallenBranch: { texture: "resource.fallenBranch", width: 62, height: 68 },
  copperOreDeposit: { texture: "resource.copperOreDeposit", width: 72, height: 81 },
  coalDeposit: { texture: "resource.coalDeposit", width: 70, height: 80 },
  ironOreDeposit: { texture: "resource.ironOreDeposit", width: 74, height: 79 },
  // The entrance already exists in the terrain painting. This texture is hover-outline only;
  // drawing its normal sprite produced a second cave several metres from the painted entrance.
  animalDenEntrance: { texture: "resource.animalDenEntrance", width: 148, height: 96, paintedIntoTerrain: true },
};

function stableNumber(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function stableGroupSize(id: string, range: [number, number]): number {
  return range[0] + stableNumber(id) % (range[1] - range[0] + 1);
}

const OBJECT_NAMES: Record<string, { en: string; ko: string }> = {
  fishingWater: { en: "Pond — fish", ko: "연못 — 낚시" },
  riverFishingWater: { en: "River — fish", ko: "강 — 낚시" },
  wildTree: { en: "Tree — needs an axe", ko: "나무 — 도끼 필요" },
  wildFruitTree: { en: "Fruit tree", ko: "과수" },
  looseStone: { en: "Loose stone", ko: "돌덩이" },
  stoneOutcrop: { en: "Rock face — needs a pickaxe", ko: "암반 — 곡괭이 필요" },
  fallenBranch: { en: "Fallen branch", ko: "나뭇가지" },
  copperOreDeposit: { en: "Rock face — needs a pickaxe", ko: "바위 — 곡괭이 필요" },
  coalDeposit: { en: "Rock face — needs a pickaxe", ko: "바위 — 곡괭이 필요" },
  ironOreDeposit: { en: "Rock face — needs a pickaxe", ko: "바위 — 곡괭이 필요" },
  animalDenEntrance: { en: "Animal den", ko: "동물 굴" },
  animalDenExit: { en: "Way out", ko: "출구" },
};
type DirectionKeys = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
  UP: Phaser.Input.Keyboard.Key;
  DOWN: Phaser.Input.Keyboard.Key;
  LEFT: Phaser.Input.Keyboard.Key;
  RIGHT: Phaser.Input.Keyboard.Key;
};

export class MosswardScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Container;
  private playerSprite?: Phaser.GameObjects.Sprite;
  private playerMarker?: Phaser.GameObjects.Triangle;
  private keys?: DirectionKeys;
  private interactKey?: Phaser.Input.Keyboard.Key;
  private target = new Phaser.Math.Vector2(836, 470);
  private background?: Phaser.GameObjects.Image;
  private collisionLayer?: Phaser.Tilemaps.TilemapLayer;
  private zoneId = "untamedWilds";
  private previousDirection = "0,0";
  private clickTarget?: Phaser.Math.Vector2;
  private pathQueue: Phaser.Math.Vector2[] = [];
  private journeyDestination?: Phaser.Math.Vector2;
  private lastPathRefreshAt = 0;
  private destinationMarker?: Phaser.GameObjects.Arc;
  private moving = false;
  private activeWalkAnimation = "wanderer.walk.side";
  private sideWalkTexture = "player.walk";
  private verticalWalkTexture = "player.walk.vertical";
  private sideWalkAnimation = "wanderer.walk.side";
  private northWalkAnimation = "wanderer.walk.north";
  private southWalkAnimation = "wanderer.walk.south";
  private strikeAnimation = "wanderer.strike";
  private lastDustAt = 0;
  private walkPhase = 0;
  // Start close enough that a region feels traversable rather than like a single miniature board;
  // the wheel can still pull back to the full-region overview.
  private cameraZoomFactor = 1.3;
  private running = false;
  private worldObjects: Phaser.GameObjects.GameObject[] = [];
  private pendingInteraction?: { id: string; x: number; y: number; reach: number };
  private activeMining?: { id: string; x: number; y: number; reach: number; nextAt: number };
  private pendingLoot?: { drop: Phaser.GameObjects.Container; meat: Phaser.GameObjects.Image; objectId: string; reward: { itemId: string; quantity: number } };
  private pendingStructureEntry?: BuiltStructure;
  private placingStructure?: BuiltStructure;
  private placementPreview?: Phaser.GameObjects.Image;
  private structureEntryArrow?: Phaser.GameObjects.Triangle;
  private structureEntryLabel?: Phaser.GameObjects.Text;
  private builtStructures = new Map<string, Phaser.GameObjects.Image>();
  private heldItemHiddenUntil = 0;
  private resourceHighlights: Array<{ id: string; x: number; y: number; outline?: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics }> = [];
  private gatherUntil = 0;
  private engagedTarget?: string;
  private engagedMark?: Phaser.GameObjects.Container;
  private weaponBadge?: Phaser.GameObjects.Container;
  private rig?: CharacterRig;
  private heldItem?: Phaser.GameObjects.Image;
  private heldItemId = "";
  private riggedEquipment = "";
  private stoneGuideLabels: Phaser.GameObjects.Text[] = [];
  private nextStrikeAt = 0;
  private nextRepathAt = 0;
  private lastAnimalClick = { id: "", at: 0 };
  private lastResourceClick = { id: "", at: 0 };
  private hoverOutline?: Phaser.GameObjects.Ellipse;
  private hoverLabel?: Phaser.GameObjects.Text;
  private restingScale = 0.16;
  private localAuthority = false;
  private lastLocalStateAt = 0;
  private predatorCooldowns = new Map<string, number>();
  private provokedPredators = new Set<string>();
  private combatAudio?: AudioContext;
  private animals = new Map<string, { container: Phaser.GameObjects.Container; sprite: Phaser.GameObjects.Sprite; outline: Phaser.GameObjects.Sprite; members: Phaser.GameObjects.Sprite[]; fill: Phaser.GameObjects.Rectangle; frame: Phaser.GameObjects.Rectangle; profile: AnimalProfile }>();
  private resources = new Map<string, { container: Phaser.GameObjects.Container; sprite: Phaser.GameObjects.Image; outline: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics; hitArea: Phaser.GameObjects.Ellipse; fill: Phaser.GameObjects.Rectangle; frame: Phaser.GameObjects.Rectangle; baseScaleX: number; baseScaleY: number; respawn?: Phaser.Time.TimerEvent }>();
  private readonly receiveWorldAction = (event: Event) => {
    const detail = (event as CustomEvent<{ objectId: string; actionId: string; success: boolean; target: { health: number; maximumHealth: number; defeated: boolean } | null; reward: { itemId: string; quantity: number } | null; combat: { counterDamage: number; playerDefeated: boolean } | null }>).detail;
    if (!detail) return;
    if (detail.target) this.resolveStrike(detail.objectId, detail.success, detail.target);
    else if (detail.actionId === "fishing.cast") this.playFishingCast(detail.objectId, detail.success);
    else if (detail.actionId !== "wildlife.attack") this.playGatherMotion(detail.objectId, detail.success);
    if (detail.reward) {
      if (detail.target?.defeated) this.createLootDrop(detail.objectId, detail.reward);
      else this.showLoot(detail.objectId, detail.reward);
    }
    if (detail.combat?.counterDamage) this.playAnimalCounterattack(detail.objectId, detail.combat.counterDamage, detail.combat.playerDefeated);
  };
  private readonly receiveWorldObject = (event: Event) => {
    const detail = (event as CustomEvent<WorldObjectState>).detail;
    if (detail) this.applyWorldObjectState(detail);
  };
  private readonly receiveWorldSnapshot = (event: Event) => {
    const detail = (event as CustomEvent<{ zoneId: string; objects: WorldObjectState[] }>).detail;
    if (!detail || detail.zoneId !== this.zoneId) return;
    for (const object of detail.objects) this.applyWorldObjectState(object);
  };
  private readonly receiveStructureMove = (event: Event) => {
    const id = (event as CustomEvent<string>).detail;
    const serialized = this.game.canvas.parentElement?.dataset.structures;
    if (!id || !serialized) return;
    const structure = (JSON.parse(serialized) as BuiltStructure[]).find((candidate) => candidate.id === id);
    if (structure) this.beginStructurePlacement(structure);
  };
  private readonly receiveStructureExit = (event: Event) => {
    const id = (event as CustomEvent<string>).detail;
    const serialized = this.game.canvas.parentElement?.dataset.structures;
    const structure = serialized && id ? (JSON.parse(serialized) as BuiltStructure[]).find((candidate) => candidate.id === id) : undefined;
    this.pendingStructureEntry = undefined;
    this.clickTarget = undefined;
    this.pathQueue = [];
    this.journeyDestination = undefined;
    this.destinationMarker?.setVisible(false);
    if (!structure) return;
    const outsideY = Phaser.Math.Clamp(structure.y + 112, 24, WORLD_HEIGHT - 24);
    const outsideX = isPositionWalkable(this.zoneId, structure.x, outsideY) ? structure.x : Phaser.Math.Clamp(structure.x + 112, 24, WORLD_WIDTH - 24);
    this.target.set(outsideX, outsideY);
    this.player?.setPosition(outsideX, outsideY);
    window.dispatchEvent(new CustomEvent("eldoria:player-state", { detail: { zoneId: this.zoneId, x: outsideX, y: outsideY } }));
  };
  private readonly receiveCanvasDoubleClick = (event: MouseEvent) => {
    const rect = this.game.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const screenX = (event.clientX - rect.left) * (this.scale.gameSize.width / rect.width);
    const screenY = (event.clientY - rect.top) * (this.scale.gameSize.height / rect.height);
    const point = this.cameras.main.getWorldPoint(screenX, screenY);
    const object = getZoneDefinition(this.zoneId)?.layers.objects.find((candidate) => {
      if (!isMiningObjectType(candidate.type)) return false;
      const region = OBJECT_REGIONS[candidate.type] ?? DEFAULT_REGION;
      const dx = (point.x - candidate.x) / (region.width / 2);
      const dy = (point.y - (candidate.y + region.offsetY)) / (region.height / 2);
      return dx * dx + dy * dy <= 1;
    });
    if (!object) return;
    event.preventDefault();
    event.stopPropagation();
    this.beginMining(object.id, object.x, object.y);
  };

  constructor() {
    super("mossward");
  }

  preload() {
    for (const [assetId, path] of getAssetEntries()) this.load.image(assetId, path);
    this.load.image("player.walk", "/assets/characters/primordial-walk.png");
    this.load.image("player.female.walk", "/assets/characters/primordial-female-walk.png");
    this.load.spritesheet("player.pickup", "/assets/characters/primordial-male-pickup.png", { frameWidth: 256, frameHeight: 512, endFrame: 3 });
    this.load.spritesheet("player.female.pickup", "/assets/characters/primordial-female-pickup.png", { frameWidth: 256, frameHeight: 512, endFrame: 3 });
    this.load.spritesheet("player.walk.vertical", "/assets/characters/primordial-walk-vertical-aligned.png", { frameWidth: 221, frameHeight: 443, endFrame: 15 });
    this.load.spritesheet("player.female.walk.vertical", "/assets/characters/primordial-female-walk-vertical-aligned.png", { frameWidth: 221, frameHeight: 443, endFrame: 15 });
    for (const profile of Object.values(ANIMAL_PROFILES)) {
      this.load.spritesheet(profile.texture, `/assets/characters/wildlife/walk/${profile.key}.png`, { frameWidth: 256, frameHeight: 256, endFrame: 3 });
      this.load.spritesheet(`wildlife.outline.${profile.key}`, `/assets/characters/wildlife/walk-outline/${profile.key}.png`, { frameWidth: 256, frameHeight: 256, endFrame: 3 });
    }
    this.load.spritesheet("wildlife.pondFish", "/assets/characters/wildlife/pond-fish-atlas.png", { frameWidth: 256, frameHeight: 256, endFrame: 3 });
    this.load.image("wildlife.ambientBird", "/assets/characters/wildlife/ambient-hawk-flight.png?v=1");
    this.load.image("item.rawGameMeat", "/assets/items/raw-game-meat.png");
    this.load.image("item.rawBirdMeat", "/assets/items/raw-bird-meat.svg");
    this.load.image("item.rawReptileMeat", "/assets/items/raw-reptile-meat.svg");
    this.load.image("item.rawAmphibianMeat", "/assets/items/raw-amphibian-meat.svg");
    this.load.image("item.rawCrustacean", "/assets/items/raw-crustacean.svg");
    this.load.image("item.arrow", "/assets/items/arrow.png?v=2");
    this.load.image("structure.log-shelter", "/assets/world/structures/player-log-shelter.png");
    for (const art of Object.values(HELD_ITEM_ART)) if (art.path) this.load.image(art.key, art.path);
  }

  create() {
    this.running = true;
    // useGameConnection currently uses Firestore in every environment, so the scene must advance its
    // own collision-aware position. Keying this off VITE_GAME_SERVER_URL left the character frozen
    // whenever that legacy variable happened to be present even though no socket movement handler ran.
    this.localAuthority = true;
    this.createBridgeTexture();
    this.registerSideWalkFrames();
    this.registerWildlifeFrames();
    const female = this.game.canvas.parentElement?.dataset.gender === "female";
    this.sideWalkTexture = female ? "player.female.walk" : "player.walk";
    this.verticalWalkTexture = female ? "player.female.walk.vertical" : "player.walk.vertical";
    this.sideWalkAnimation = female ? "wanderer.female.walk.side" : "wanderer.walk.side";
    this.northWalkAnimation = female ? "wanderer.female.walk.north" : "wanderer.walk.north";
    this.southWalkAnimation = female ? "wanderer.female.walk.south" : "wanderer.walk.south";
    this.strikeAnimation = female ? "wanderer.female.strike" : "wanderer.strike";
    this.activeWalkAnimation = this.sideWalkAnimation;
    const savedPosition = this.game.canvas.parentElement?.dataset.position;
    if (savedPosition) {
      try {
        const position = JSON.parse(savedPosition) as { zoneId: string; x: number; y: number };
        if (getZoneDefinition(position.zoneId) && Number.isFinite(position.x) && Number.isFinite(position.y)) {
          this.zoneId = position.zoneId;
          this.target.set(position.x, position.y);
        }
      } catch {
        // A malformed DOM snapshot should fall back to the safe meadow spawn.
      }
    }
    const initialZone = getZoneDefinition(this.zoneId) ?? getZoneDefinition("untamedWilds")!;
    this.background = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, initialZone.layers.terrain.assetId).setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT);
    this.applyZoneTerrainTone(initialZone.id);
    this.createCollisionTileLayer(this.zoneId);
    // The measured poses put the feet on the container's own origin, so the figure stands where it stands.
    this.playerSprite = this.add.sprite(0, 0, this.sideWalkTexture, 0).setScale(female ? 0.14 : 0.16).setOrigin(0.5, 1);
    this.restingScale = this.playerSprite.scaleY;
    this.anims.create({ key: this.sideWalkAnimation, frames: this.anims.generateFrameNumbers(this.sideWalkTexture, { frames: [0, 1, 2, 3, 4, 5, 6, 7] }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: this.northWalkAnimation, frames: this.anims.generateFrameNumbers(this.verticalWalkTexture, { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: this.southWalkAnimation, frames: this.anims.generateFrameNumbers(this.verticalWalkTexture, { start: 8, end: 15 }), frameRate: 10, repeat: -1 });
    // There is no punch sheet, but the walk cycle already holds a drawn arm-in and arm-out pose; measured
    // off the sheet, the reach between them differs by roughly a third of the figure's width. Snapping
    // between the two moves the actual painted arm rather than shoving the whole body forward.
    const strike = SIDE_WALK_SHEETS[this.sideWalkTexture as keyof typeof SIDE_WALK_SHEETS].strike;
    this.anims.create({
      key: this.strikeAnimation,
      frames: this.anims.generateFrameNumbers(this.sideWalkTexture, { frames: [strike.coil, strike.extend, strike.extend, strike.extend, strike.coil, 0] }),
      frameRate: 16,
      repeat: 0,
    });
    for (const [key, texture] of [["wanderer.pickup", "player.pickup"], ["wanderer.female.pickup", "player.female.pickup"]] as const) {
      if (!this.anims.exists(key)) this.anims.create({ key, frames: this.anims.generateFrameNumbers(texture, { frames: [0, 1, 2, 2, 3, 0] }), frameRate: 7, repeat: 0 });
    }
    this.playerMarker = this.add.triangle(0, -124, 0, 0, 11, 0, 5.5, 8, 0xf4df82, 1).setOrigin(0.5);
    // What the wanderer is fighting with, raised over their head only while a fight is on.
    this.weaponBadge = this.createFistBadge().setVisible(false);
    this.player = this.add.container(this.target.x, this.target.y, [this.playerSprite, this.playerMarker, this.weaponBadge]).setDepth(10);
    this.heldItem = this.add.image(0, 0, "__DEFAULT").setVisible(false);
    this.player.add(this.heldItem);
    // The body is one layer of a rig; worn and held layers join it as their sheets arrive.
    this.rig = new CharacterRig(this, this.player);
    this.tweens.add({ targets: this.playerMarker, y: -130, alpha: 0.62, duration: 650, yoyo: true, repeat: -1, ease: "Sine.InOut" });

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT).startFollow(this.player, true, 0.12, 0.12);
    this.layoutCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutCamera, this));

    this.keys = this.input.keyboard?.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as DirectionKeys | undefined;
    this.interactKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.destinationMarker = this.add.circle(this.target.x, this.target.y, 10, 0xdacb78, 0.22).setStrokeStyle(2, 0xeadf9a, 0.8).setDepth(8).setVisible(false);
    this.createWorldObjects(this.zoneId);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      if (!pointer.leftButtonDown()) return;
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      if (this.placingStructure) {
        if (!this.canPlaceStructure(point.x, point.y)) return;
        window.dispatchEvent(new CustomEvent("eldoria:structure-place", { detail: { id: this.placingStructure.id, zoneId: this.zoneId, x: Math.round(point.x), y: Math.round(point.y) } }));
        this.placingStructure = undefined;
        this.placementPreview?.destroy();
        this.placementPreview = undefined;
        return;
      }
      const miningObject = getZoneDefinition(this.zoneId)?.layers.objects.find((object) => {
        if (!isMiningObjectType(object.type)) return false;
        const region = OBJECT_REGIONS[object.type] ?? DEFAULT_REGION;
        const dx = (point.x - object.x) / (region.width / 2);
        const dy = (point.y - (object.y + region.offsetY)) / (region.height / 2);
        return dx * dx + dy * dy <= 1;
      });
      if (miningObject) {
        this.handleMiningClick(miningObject.id, miningObject.x, miningObject.y, miningObject.type, (pointer.event as MouseEvent).detail >= 2);
        return;
      }
      // Explicit object hit areas win over the broad shoreline fishing zone. Otherwise an ore node
      // painted near water starts fishing before its own double-click handler can mine it.
      if (currentlyOver.length > 0) return;
      const fishingWater = this.fishingWaterNear(point.x, point.y);
      if (fishingWater && this.game.canvas.parentElement?.dataset.hasFishingRod === "true") {
        this.requestInteraction(fishingWater.id, fishingWater.x, fishingWater.y);
        return;
      }
      this.pendingInteraction = undefined;
      this.stopMining();
      this.walkTo(point.x, point.y);
      // Movement is already armed before optional combat visuals are cleared. This keeps a stale or
      // partially hot-reloaded visual from swallowing the click that should move the character.
      this.disengage();
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.placingStructure || !this.placementPreview) return;
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const valid = this.canPlaceStructure(point.x, point.y);
      this.placementPreview.setPosition(point.x, point.y).setTint(valid ? 0x9fcb88 : 0xd66a5a).setAlpha(valid ? 0.72 : 0.42);
    });
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      const zoomStep = deltaY < 0 ? 1.12 : 1 / 1.12;
      this.cameraZoomFactor = Phaser.Math.Clamp(this.cameraZoomFactor * zoomStep, 1, 2.5);
      this.layoutCamera();
    });
    this.game.canvas.addEventListener("dblclick", this.receiveCanvasDoubleClick);
    window.addEventListener("eldoria:player-state", this.receivePlayerState);
    window.addEventListener("eldoria:world-action", this.receiveWorldAction);
    window.addEventListener("eldoria:world-object", this.receiveWorldObject);
    window.addEventListener("eldoria:world-snapshot", this.receiveWorldSnapshot);
    window.addEventListener("eldoria:structures", this.receiveStructures);
    window.addEventListener("eldoria:structure-move", this.receiveStructureMove);
    window.addEventListener("eldoria:structure-exit", this.receiveStructureExit);
    const savedStructures = this.game.canvas.parentElement?.dataset.structures;
    if (savedStructures) this.syncStructures(JSON.parse(savedStructures) as BuiltStructure[]);
    window.dispatchEvent(new CustomEvent("eldoria:observe-world", { detail: { zoneId: this.zoneId } }));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.running = false;
      this.stopMining();
      window.removeEventListener("eldoria:player-state", this.receivePlayerState);
      window.removeEventListener("eldoria:world-action", this.receiveWorldAction);
      window.removeEventListener("eldoria:world-object", this.receiveWorldObject);
      window.removeEventListener("eldoria:world-snapshot", this.receiveWorldSnapshot);
      window.removeEventListener("eldoria:structures", this.receiveStructures);
      window.removeEventListener("eldoria:structure-move", this.receiveStructureMove);
      window.removeEventListener("eldoria:structure-exit", this.receiveStructureExit);
      this.game.canvas.removeEventListener("dblclick", this.receiveCanvasDoubleClick);
      this.background = undefined;
      this.collisionLayer = undefined;
    });
  }

  private createBridgeTexture() {
    if (this.textures.exists("structure.wood-bridge")) return;
    const bridge = this.make.graphics({ x: 0, y: 0 });
    bridge.fillStyle(0x3a2515, 1).fillRoundedRect(0, 5, 180, 50, 8);
    for (let index = 0; index < 9; index += 1) {
      const x = 4 + index * 20;
      bridge.fillStyle(index % 2 ? 0x8a5b32 : 0x9e6a3b, 1).fillRoundedRect(x, 3, 17, 54, 4);
      bridge.lineStyle(1, 0xd1a06b, 0.45).strokeRoundedRect(x, 3, 17, 54, 4);
    }
    bridge.lineStyle(4, 0x5a361e, 1).lineBetween(0, 9, 180, 9).lineBetween(0, 51, 180, 51);
    bridge.generateTexture("structure.wood-bridge", 180, 60).destroy();
  }

  update(_time: number, delta: number) {
    if (!this.player) return;
    if (!this.keys) return;
    const previousPlayerX = this.player.x;
    const previousPlayerY = this.player.y;
    // Exponential damping is frame-rate independent. A fixed lerp factor made the same walk ease and
    // slide differently at 60 Hz, 120 Hz and on a busy mobile frame.
    const follow = 1 - Math.exp(-Math.min(delta, 50) / 55);
    this.player.x = Phaser.Math.Linear(this.player.x, this.target.x, follow);
    this.player.y = Phaser.Math.Linear(this.player.y, this.target.y, follow);
    const renderedDeltaX = this.player.x - previousPlayerX;
    const renderedDeltaY = this.player.y - previousPlayerY;
    const renderedDistance = Math.hypot(renderedDeltaX, renderedDeltaY);
    this.player.setDepth(10 + this.player.y / WORLD_HEIGHT);

    const x = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    const y = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown);
    const keyboardMagnitude = Math.hypot(x, y);
    if (keyboardMagnitude > 0) {
      this.clickTarget = undefined;
      this.pathQueue = [];
      this.journeyDestination = undefined;
      this.pendingInteraction = undefined;
      this.stopMining();
      this.disengage();
      this.destinationMarker?.setVisible(false);
    }
    if (this.pendingInteraction && Phaser.Math.Distance.Between(this.target.x, this.target.y, this.pendingInteraction.x, this.pendingInteraction.y) <= this.pendingInteraction.reach) {
      const interactionId = this.pendingInteraction.id;
      window.dispatchEvent(new CustomEvent("eldoria:interact", { detail: { objectId: interactionId } }));
      if (this.activeMining?.id === interactionId) {
        this.activeMining.nextAt = this.time.now + MINING_INTERVAL_MS;
        window.dispatchEvent(new CustomEvent("eldoria:mining-start", { detail: { objectId: interactionId, intervalMs: MINING_INTERVAL_MS } }));
      }
      this.pendingInteraction = undefined;
      this.clickTarget = undefined;
      this.pathQueue = [];
      this.journeyDestination = undefined;
      this.destinationMarker?.setVisible(false);
    }
    if (this.pendingLoot && Phaser.Math.Distance.Between(this.target.x, this.target.y, this.pendingLoot.drop.x, this.pendingLoot.drop.y) <= 54) {
      const loot = this.pendingLoot;
      this.pendingLoot = undefined;
      this.clickTarget = undefined;
      this.pathQueue = [];
      this.journeyDestination = undefined;
      this.destinationMarker?.setVisible(false);
      this.playLootPickup(loot);
    }
    if (this.pendingStructureEntry && Phaser.Math.Distance.Between(this.target.x, this.target.y, this.pendingStructureEntry.x, this.pendingStructureEntry.y) <= 92) {
      const structureId = this.pendingStructureEntry.id;
      this.pendingStructureEntry = undefined;
      this.clickTarget = undefined;
      this.pathQueue = [];
      this.journeyDestination = undefined;
      this.destinationMarker?.setVisible(false);
      window.dispatchEvent(new CustomEvent("eldoria:structure-enter", { detail: structureId }));
    }
    this.syncEquipmentLayers();
    const showStoneGuides = this.isBowEquipped() && !this.hasArrow();
    for (const label of this.stoneGuideLabels) label.setVisible(showStoneGuides);
    this.pursueEngagedAnimal();
    this.pursueProvokedPredators(delta);
    this.triggerPredatorAggression();
    let nearest: (typeof this.resourceHighlights)[number] | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const resource of this.resourceHighlights) {
      const distance = Phaser.Math.Distance.Between(this.target.x, this.target.y, resource.x, resource.y);
      if (distance < nearestDistance) {
        nearest = resource;
        nearestDistance = distance;
      }
    }
    if (nearest && nearestDistance <= 260 && this.interactKey && Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      window.dispatchEvent(new CustomEvent("eldoria:interact", { detail: { objectId: nearest.id } }));
    }
    let direction = keyboardMagnitude > 0 ? { x: x / keyboardMagnitude, y: y / keyboardMagnitude } : { x: 0, y: 0 };
    if (keyboardMagnitude === 0 && this.clickTarget) {
      const deltaX = this.clickTarget.x - this.target.x;
      const deltaY = this.clickTarget.y - this.target.y;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance <= 12) {
        // Step onto the next corner of the route rather than ending the journey at the first one.
        const reached = this.clickTarget;
        this.clickTarget = this.pathQueue.shift();
        if (!this.clickTarget) {
          const arrivalX = Math.sign(reached.x - this.target.x);
          const arrivalY = Math.sign(reached.y - this.target.y);
          this.target.set(reached.x, reached.y);
          this.journeyDestination = undefined;
          this.destinationMarker?.setVisible(false);
          if (this.applyLocalZoneTransition(arrivalX, arrivalY)) return;
        }
      } else {
        // Collapse the route as it opens up. Tile-centre corners make a walk zig-zag sideways long
        // after the obstacle that caused them is behind you, so drop any corner you can already see past.
        while (this.pathQueue.length > 0 && this.hasClearLine(this.target, this.pathQueue[0]!)) {
          this.clickTarget = this.pathQueue.shift()!;
        }
        const aimX = this.clickTarget.x - this.target.x;
        const aimY = this.clickTarget.y - this.target.y;
        const aim = Math.hypot(aimX, aimY) || 1;
        direction = { x: aimX / aim, y: aimY / aim };
      }
    }
    const signature = `${direction.x},${direction.y}`;
    if (signature !== this.previousDirection) {
      this.previousDirection = signature;
      window.dispatchEvent(new CustomEvent("eldoria:move-intent", { detail: direction }));
    }
    // The hosted single-player build persists through Firebase and has no authoritative socket tick.
    // Advance the same collision-aware target locally so keyboard and click movement remain identical.
    if (this.localAuthority && Math.hypot(direction.x, direction.y) > 0.05) {
      const step = 52 * Math.min(delta, 50) / 1000;
      const zone = getZoneDefinition(this.zoneId);
      if (zone) {
        const nextX = Phaser.Math.Clamp(this.target.x + direction.x * step, 30, zone.width - 30);
        const nextY = Phaser.Math.Clamp(this.target.y + direction.y * step, 45, zone.height - 25);
        let advanced = false;
        if (this.isSceneWalkable(nextX, nextY)) { this.target.set(nextX, nextY); advanced = true; }
        else if (this.isSceneWalkable(nextX, this.target.y)) { this.target.x = nextX; advanced = true; }
        else if (this.isSceneWalkable(this.target.x, nextY)) { this.target.y = nextY; advanced = true; }
        // A newly placed house or an updated resource state can invalidate an existing route. Keep
        // the original destination and ask A* for another corridor instead of walking in place.
        if (!advanced && this.clickTarget && this.journeyDestination && this.time.now >= this.lastPathRefreshAt) {
          this.refreshJourneyPath(zone);
        }
        if (advanced && this.applyLocalZoneTransition(direction.x, direction.y)) return;
      }
      if (this.time.now - this.lastLocalStateAt >= 250) {
        this.lastLocalStateAt = this.time.now;
        window.dispatchEvent(new CustomEvent("eldoria:player-state", { detail: { zoneId: this.zoneId, x: this.target.x, y: this.target.y } }));
      }
    }
    // Animate what actually moved on screen, not merely what the input requested. This keeps the legs
    // walking through the camera-smoothing tail and prevents running in place against collision.
    const renderedDirection = renderedDistance > 0.025
      ? { x: renderedDeltaX / renderedDistance, y: renderedDeltaY / renderedDistance }
      : { x: 0, y: 0 };
    this.animateWalk(renderedDirection, renderedDistance);
    // Equipment must consume the frame selected above. Updating it first left hands and tools one
    // pose behind the body, which was especially visible at the ends of each stride.
    this.syncHeldItem();
    for (const animal of this.animals.values()) {
      if (!animal.outline.visible) continue;
      animal.outline.setFrame(animal.sprite.frame.name).setFlipX(animal.sprite.flipX).setDisplaySize(animal.sprite.displayWidth, animal.sprite.displayHeight);
    }
    if (this.rig && this.playerSprite) {
      const frameName = this.playerSprite.frame.name;
      this.rig.followBody(this.playerSprite, Number.parseInt(frameName, 10) || 0);
    }
  }

  private receivePlayerState = (event: Event) => {
    if (!this.running) return;
    const position = (event as CustomEvent<{ zoneId: string; x: number; y: number }>).detail;
    if (!position) return;
    if (position.zoneId !== this.zoneId) {
      this.zoneId = position.zoneId;
      const zone = getZoneDefinition(position.zoneId);
      if (zone) {
        this.background?.setTexture(zone.layers.terrain.assetId);
        this.applyZoneTerrainTone(position.zoneId);
        this.createCollisionTileLayer(position.zoneId);
        this.createWorldObjects(position.zoneId);
        window.dispatchEvent(new CustomEvent("eldoria:observe-world", { detail: { zoneId: position.zoneId } }));
        this.cameras.main.fadeIn(220, 4, 10, 7);
      }
      if (this.player) this.player.setPosition(position.x, position.y);
    }
    this.target.set(position.x, position.y);
  };

  /** Neighbouring cells share a biome painting, while a restrained east-west colour drift gives
   * every local map its own light and soil without turning a border crossing into a hard cut. */
  private applyZoneTerrainTone(zoneId: string) {
    const index = worldDefinition.zones.filter((zone) => zone.id !== "animalDen").findIndex((zone) => zone.id === zoneId);
    if (!this.background || index < 0) { this.background?.clearTint(); return; }
    const column = index % 10;
    const tones = [0xf3eadb, 0xeee9dc, 0xe8ebdd, 0xe2ecdd, 0xddebdc, 0xdae8d8, 0xdce4d2, 0xe1dfcf, 0xe7dbcb, 0xecd6c6];
    this.background.setTint(tones[column]!);
  }

  /** Surface maps form one continuous west-to-east frontier. Crossing an open map edge transfers the
   * wanderer to the matching road spawn in the adjacent zone and persists that exact position. */
  private applyLocalZoneTransition(horizontalIntent: number, verticalIntent: number) {
    if (Math.hypot(horizontalIntent, verticalIntent) < 0.05) return false;
    const zone = getZoneDefinition(this.zoneId);
    if (!zone) return false;
    const edge = horizontalIntent < 0 && this.target.x <= 30.5 ? "west"
      : horizontalIntent > 0 && this.target.x >= zone.width - 30.5 ? "east"
        : verticalIntent < 0 && this.target.y <= 45.5 ? "north"
          : verticalIntent > 0 && this.target.y >= zone.height - 25.5 ? "south"
            : null;
    if (!edge) return false;
    const exit = zone.exits.find((candidate) => candidate.edge === edge);
    const destination = exit ? getZoneDefinition(exit.toZoneId) : undefined;
    const spawn = destination?.layers.spawn.find((candidate) => candidate.id === exit?.toSpawnId);
    if (!exit || !destination || !spawn) return false;
    const position = { zoneId: destination.id, x: spawn.x, y: spawn.y };
    this.clickTarget = undefined;
    this.pathQueue = [];
    this.journeyDestination = undefined;
    this.pendingInteraction = undefined;
    this.stopMining();
    this.disengage();
    this.destinationMarker?.setVisible(false);
    window.dispatchEvent(new CustomEvent("eldoria:zone-change", { detail: position.zoneId }));
    window.dispatchEvent(new CustomEvent("eldoria:player-state", { detail: position }));
    return true;
  }

  private receiveStructures = (event: Event) => {
    const structures = (event as CustomEvent<BuiltStructure[]>).detail;
    if (Array.isArray(structures)) this.syncStructures(structures);
  };

  private syncStructures(structures: BuiltStructure[]) {
    const pending = structures.find((structure) => structure.zoneId === this.zoneId && structure.x < 0 && structure.y < 0);
    if (pending && this.placingStructure?.id !== pending.id) this.beginStructurePlacement(pending);
    if (!pending && this.placingStructure) {
      this.placingStructure = undefined;
      this.placementPreview?.destroy();
      this.placementPreview = undefined;
    }
    const placed = structures.filter((structure) => structure.x >= 0 && structure.y >= 0);
    const active = new Set(placed.map((structure) => structure.id));
    for (const [id, image] of this.builtStructures) if (!active.has(id)) { image.destroy(); this.builtStructures.delete(id); }
    for (const structure of placed) {
      if (structure.zoneId !== this.zoneId) continue;
      const existing = this.builtStructures.get(structure.id);
      if (existing) {
        existing.setPosition(structure.x, structure.y).setDepth(8 + structure.y / WORLD_HEIGHT).setVisible(true);
        continue;
      }
      const bridge = structure.type === "wood-bridge";
      const image = this.add.image(structure.x, structure.y, bridge ? "structure.wood-bridge" : "structure.log-shelter")
        .setDisplaySize(bridge ? 180 : 190, bridge ? 60 : 134)
        .setOrigin(0.5, bridge ? 0.5 : 0.86)
        .setDepth(bridge ? 9.4 : 8 + structure.y / WORLD_HEIGHT)
        .setData("structureType", structure.type)
        .setInteractive({ useHandCursor: true });
      if (bridge) {
        this.builtStructures.set(structure.id, image);
        continue;
      }
      image.on("pointerover", () => this.showStructureEntryHint(structure));
      image.on("pointerout", () => this.hideStructureEntryHint());
      image.on("pointerdown", () => {
        this.hideStructureEntryHint();
        const distance = Phaser.Math.Distance.Between(this.target.x, this.target.y, structure.x, structure.y);
        if (distance <= 92) window.dispatchEvent(new CustomEvent("eldoria:structure-enter", { detail: structure.id }));
        else {
          this.pendingStructureEntry = structure;
          const angle = Phaser.Math.Angle.Between(structure.x, structure.y, this.target.x, this.target.y);
          this.walkTo(structure.x + Math.cos(angle) * 72, structure.y + Math.sin(angle) * 72);
        }
      });
      this.builtStructures.set(structure.id, image);
    }
  }

  private showStructureEntryHint(structure: BuiltStructure) {
    this.structureEntryArrow ??= this.add.triangle(0, 0, 0, 0, 14, 0, 7, 10, 0xf3df7e, 1).setOrigin(0.5).setDepth(45);
    this.structureEntryLabel ??= this.add.text(0, 0, "", { fontFamily: GAME_FONT, fontSize: "11px", color: "#f3e7b6", backgroundColor: "#0b1512e6", padding: { x: 7, y: 4 } }).setOrigin(0.5, 1).setDepth(45).setResolution(Math.min(2, window.devicePixelRatio || 1));
    this.tweens.killTweensOf(this.structureEntryArrow);
    this.structureEntryArrow.setPosition(structure.x + 25, structure.y - 62).setAlpha(1).setVisible(true);
    this.structureEntryLabel.setPosition(structure.x + 25, structure.y - 75).setText(this.game.canvas.parentElement?.dataset.language === "ko" ? "들어가기" : "Enter").setVisible(true);
    this.tweens.add({ targets: this.structureEntryArrow, y: structure.y - 55, duration: 420, yoyo: true, repeat: -1, ease: "Sine.InOut" });
  }

  private hideStructureEntryHint() {
    if (this.structureEntryArrow) this.tweens.killTweensOf(this.structureEntryArrow);
    this.structureEntryArrow?.setVisible(false);
    this.structureEntryLabel?.setVisible(false);
  }

  private beginStructurePlacement(structure: BuiltStructure) {
    this.placingStructure = structure;
    this.builtStructures.get(structure.id)?.setVisible(false);
    this.placementPreview?.destroy();
    const bridge = structure.type === "wood-bridge";
    this.placementPreview = this.add.image(this.target.x, this.target.y, bridge ? "structure.wood-bridge" : "structure.log-shelter")
      .setDisplaySize(bridge ? 180 : 190, bridge ? 60 : 134).setOrigin(0.5, bridge ? 0.5 : 0.86).setTint(0x9fcb88).setAlpha(0.72).setDepth(40);
  }

  private canPlaceStructure(x: number, y: number) {
    const zone = getZoneDefinition(this.zoneId);
    if (!zone || x < 95 || y < 80 || x > zone.width - 95 || y > zone.height - 45) return false;
    if (this.placingStructure?.type === "wood-bridge") {
      const centerBlocked = !isPositionWalkable(this.zoneId, x, y);
      const banksOpen = isPositionWalkable(this.zoneId, x - 95, y) && isPositionWalkable(this.zoneId, x + 95, y);
      return centerBlocked && banksOpen && [...this.builtStructures.values()].every((building) => Phaser.Math.Distance.Between(x, y, building.x, building.y) >= 150);
    }
    if (![[-52, -24], [52, -24], [-52, 18], [52, 18], [0, 0]].every(([offsetX, offsetY]) => isPositionWalkable(this.zoneId, x + offsetX!, y + offsetY!))) return false;
    if (zone.layers.objects.some((object) => Phaser.Math.Distance.Between(x, y, object.x, object.y) < 105)) return false;
    return [...this.builtStructures.values()].every((building) => Phaser.Math.Distance.Between(x, y, building.x, building.y) >= 170);
  }

  private playSleepMotion() {
    if (!this.player || !this.playerSprite) return;
    this.heldItemHiddenUntil = this.time.now + 1500;
    this.playerSprite.stop().setAngle(90).setAlpha(0.9);
    this.tweens.add({ targets: this.playerSprite, y: 6, alpha: 0.25, duration: 380, yoyo: true, hold: 520, onYoyo: () => window.dispatchEvent(new CustomEvent("eldoria:sleep")), onComplete: () => this.playerSprite?.setAngle(0).setAlpha(1).setY(0).setTexture(this.sideWalkTexture, 0) });
  }

  private layoutCamera() {
    const fitZoom = Math.max(this.scale.width / WORLD_WIDTH, this.scale.height / WORLD_HEIGHT, 0.72);
    const zoom = fitZoom * this.cameraZoomFactor;
    this.cameras.main.setZoom(zoom);
  }

  private contextualObjectName(type: string) {
    const equipped = this.game.canvas.parentElement?.dataset.equipped ?? "";
    if (type === "wildTree" && (equipped === "tool.hand-axe" || equipped.endsWith("-axe"))) return { en: "Tree", ko: "나무" };
    if ((type === "stoneOutcrop" || type.endsWith("OreDeposit") || type === "coalDeposit") && (equipped === "tool.pickaxe" || equipped.endsWith("-pickaxe"))) return { en: "Rock face", ko: "암반" };
    if ((type === "fishingWater" || type === "riverFishingWater") && (equipped === "tool.fishing-rod" || equipped.endsWith("-fishing-rod"))) return { en: "Fishing water", ko: "낚시터" };
    return OBJECT_NAMES[type];
  }

  /** One reusable outline and label, moved to whatever the cursor is over. */
  private showHover(x: number, y: number, width: number, height: number, name?: { en: string; ko: string }, spriteOutline?: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics) {
    const korean = this.game.canvas.parentElement?.dataset.language === "ko";
    this.hoverOutline ??= this.add.ellipse(0, 0, 10, 10, 0xf1dc77, 0.07).setStrokeStyle(2, 0xf1dc77, 0.9).setDepth(11);
    this.hoverLabel ??= this.add.text(0, 0, "", {
      fontFamily: GAME_FONT,
      fontSize: "15px",
      fontStyle: "bold",
      color: "#fff2bc",
      backgroundColor: "#07110df2",
      stroke: "#020504",
      strokeThickness: 2,
      padding: { x: 10, y: 6 },
      shadow: { offsetX: 0, offsetY: 2, color: "#000000", blur: 3, fill: true },
    }).setOrigin(0.5, 1).setDepth(30).setResolution(Math.min(3, window.devicePixelRatio || 1));
    if (spriteOutline) {
      this.hoverOutline.setVisible(false);
      spriteOutline.setVisible(true);
    } else {
      this.hoverOutline.setPosition(x, y).setSize(width, height).setDisplaySize(width, height).setVisible(true);
    }
    this.hoverLabel.setPosition(x, y - height / 2 - 6).setText(name ? (korean ? name.ko : name.en) : "").setVisible(Boolean(name));
  }

  private hideHover(spriteOutline?: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics) {
    spriteOutline?.setVisible(false);
    this.hoverOutline?.setVisible(false);
    this.hoverLabel?.setVisible(false);
  }

  private registerSideWalkFrames() {
    for (const [textureKey, sheet] of Object.entries(SIDE_WALK_SHEETS)) {
      const texture = this.textures.get(textureKey);
      sheet.poses.forEach(([x, width], index) => {
        if (!texture.has(String(index))) texture.add(index, 0, x, sheet.y, width, sheet.height);
      });
    }
  }

  private registerWildlifeFrames() {
    for (const species of Object.values(ANIMAL_PROFILES)) {
      const animation = `wildlife.${species.key}.walk`;
      if (this.anims.exists(animation)) continue;
      this.anims.create({ key: animation, frames: this.anims.generateFrameNumbers(species.texture, { start: 0, end: 3 }), frameRate: species.key === "turtle" ? 3 : species.key === "bear" || species.key === "bison" ? 5 : 7, repeat: -1 });
      this.anims.create({ key: `wildlife.${species.key}.outline.walk`, frames: this.anims.generateFrameNumbers(`wildlife.outline.${species.key}`, { start: 0, end: 3 }), frameRate: species.key === "turtle" ? 3 : species.key === "bear" || species.key === "bison" ? 5 : 7, repeat: -1 });
    }
  }

  private createWorldObjects(zoneId: string) {
    this.stopMining();
    for (const object of this.worldObjects) object.destroy();
    this.worldObjects = [];
    this.resourceHighlights = [];
    this.animals.clear();
    this.provokedPredators.clear();
    for (const resource of this.resources.values()) resource.respawn?.destroy();
    this.resources.clear();
    this.stoneGuideLabels = [];
    this.hideHover();
    const zone = getZoneDefinition(zoneId);
    if (!zone) return;
    for (const object of zone.layers.objects) {
      if (object.type.startsWith("ambientBirdFlock")) {
        this.createAmbientBirdFlock(object.id, object.x, object.y, zoneId, object.type.slice("ambientBirdFlock".length));
        continue;
      }
      if (object.type.startsWith("wildlifeSpawn")) {
        const profile = ANIMAL_PROFILES[object.type] ?? ANIMAL_PROFILES.wildlifeSpawnBoar!;
        const memberCount = stableGroupSize(object.id, profile.group);
        const members: Phaser.GameObjects.Sprite[] = [];
        for (let index = memberCount - 1; index >= 0; index -= 1) {
          const sprite = this.add.sprite(0, 0, profile.texture, 0).setOrigin(0.5, ANIMAL_ORIGIN_Y);
          const memberScale = index === 0 ? 0.88 + (stableNumber(object.id) % 25) / 100 : 0.78 + (stableNumber(`${object.id}:${index}`) % 15) / 100;
          const height = profile.displayHeight * memberScale;
          sprite.setDisplaySize(height * (sprite.frame.width / sprite.frame.height), height);
          sprite.setData("baseScaleX", sprite.scaleX).setData("baseScaleY", sprite.scaleY);
          if (index > 0) {
            const side = index % 2 === 0 ? 1 : -1;
            const rank = Math.ceil(index / 2);
            const spread = profile.society === "flock" || profile.society === "colony" ? 0.9 : 0.62;
            sprite.setPosition(side * rank * profile.displayHeight * spread, rank * profile.displayHeight * 0.22);
            sprite.setAlpha(0.9);
          }
          sprite.setData("formationX", sprite.x).setData("formationY", sprite.y);
          members.unshift(sprite);
        }
        const animalSprite = members[0]!;
        const animalOutline = this.add.sprite(0, 0, `wildlife.outline.${profile.key}`, 0).setOrigin(0.5, ANIMAL_ORIGIN_Y)
          .setDisplaySize(animalSprite.displayWidth, animalSprite.displayHeight).setVisible(false);
        const barY = -profile.displayHeight - 9;
        const barFrame = this.add.rectangle(0, barY, HEALTH_BAR_WIDTH, 5, 0x0b1512, 0.9).setStrokeStyle(1, 0x000000, 0.7).setVisible(false);
        const barFill = this.add.rectangle(-HEALTH_BAR_WIDTH / 2 + 1, barY, HEALTH_BAR_WIDTH - 2, 3, 0xb8523f).setOrigin(0, 0.5).setVisible(false);
        const animal = this.add.container(object.x, object.y, [animalOutline, ...members.slice(1), animalSprite, barFrame, barFill]).setDepth(10 + object.y / WORLD_HEIGHT);
        this.animals.set(object.id, { container: animal, sprite: animalSprite, outline: animalOutline, members, fill: barFill, frame: barFrame, profile });
        animalSprite.on("pointerover", () => this.showHover(animal.x, animal.y - profile.displayHeight * 0.45, profile.displayHeight * 1.55, profile.displayHeight * 1.2, profile.label, animalOutline));
        animalSprite.on("pointerout", () => { if (this.engagedTarget !== object.id) this.hideHover(animalOutline); });
        animalSprite.setInteractive({ useHandCursor: true }).on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          pointer.event.stopPropagation();
          // Ultima Online's convention: one click picks the quarry out, two sets you on it.
          const doubleClicked = this.lastAnimalClick.id === object.id && this.time.now - this.lastAnimalClick.at < DOUBLE_CLICK_MS;
          this.lastAnimalClick = { id: object.id, at: this.time.now };
          if (doubleClicked) this.engageAnimal(object.id);
          else this.markAnimal(object.id);
        });
        this.scheduleAnimalMovement(animal, members, profile, object.x, object.y, zoneId, { heading: Phaser.Math.FloatBetween(0, Math.PI * 2), stepsRemaining: Phaser.Math.Between(3, 7), alert: 0 }, object.id);
        this.worldObjects.push(animal);
        continue;
      }
      const interactiveTypes = ["fishingWater", "riverFishingWater", "wildTree", "wildFruitTree", "animalDenEntrance", "animalDenExit", "stoneOutcrop", "copperOreDeposit", "coalDeposit", "ironOreDeposit", "looseStone", "fallenBranch"];
      if (!interactiveTypes.includes(object.type)) continue;
      const region = OBJECT_REGIONS[object.type] ?? DEFAULT_REGION;
      const regionY = object.y + region.offsetY;
      if (object.type === "fishingWater" || object.type === "riverFishingWater") this.createPondLife(object.x, object.y, zoneId, object.type);
      const hitDepth = isMiningObjectType(object.type) ? 14
        : object.type === "fishingWater" || object.type === "riverFishingWater" ? 11
          : 12;
      const hitArea = this.add.ellipse(object.x, regionY, region.width, region.height, 0x000000, 0.001).setDepth(hitDepth).setInteractive({ useHandCursor: true });
      hitArea.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (isMiningObjectType(object.type)) {
          pointer.event.stopPropagation();
          this.handleMiningClick(object.id, object.x, object.y, object.type, (pointer.event as MouseEvent).detail >= 2);
          return;
        }
        pointer.event.stopPropagation();
        this.stopMining();
        this.requestInteraction(object.id, object.x, object.y);
      });
      hitArea.on("pointerover", () => this.showHover(object.x, regionY, region.width, region.height, this.contextualObjectName(object.type), outline));
      hitArea.on("pointerout", () => this.hideHover(outline));
      this.worldObjects.push(hitArea);

      let outline: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics | undefined;
      const art = RESOURCE_ART[object.type];
      if (object.type === "stoneOutcrop") {
        // The rock is already part of the terrain painting. Trace that mass instead of drawing a
        // second rock on top of it; the hover line follows the visible cliff rather than a circle.
        outline = this.add.graphics().setVisible(false);
        outline.lineStyle(3, 0xf1dc77, 0.9).strokePoints([
          new Phaser.Math.Vector2(-108, 0), new Phaser.Math.Vector2(-96, -66), new Phaser.Math.Vector2(-72, -134),
          new Phaser.Math.Vector2(-38, -206), new Phaser.Math.Vector2(6, -224), new Phaser.Math.Vector2(52, -190),
          new Phaser.Math.Vector2(82, -122), new Phaser.Math.Vector2(106, -42), new Phaser.Math.Vector2(108, 0),
        ], true);
        const sprite = this.add.image(0, 0, "resource.looseStone").setVisible(false);
        const barY = -230;
        const barFrame = this.add.rectangle(0, barY, RESOURCE_BAR_WIDTH, 5, 0x0b1512, 0.92).setStrokeStyle(1, 0x000000, 0.75).setVisible(false);
        const barFill = this.add.rectangle(-RESOURCE_BAR_WIDTH / 2 + 1, barY, RESOURCE_BAR_WIDTH - 2, 3, 0x9eaa63).setOrigin(0, 0.5).setVisible(false);
        const container = this.add.container(object.x, object.y, [outline, sprite, barFrame, barFill]).setDepth(10 + object.y / WORLD_HEIGHT);
        this.resources.set(object.id, { container, sprite, outline, hitArea, fill: barFill, frame: barFrame, baseScaleX: 1, baseScaleY: 1 });
        this.worldObjects.push(container);
      } else if (art) {
        // Keep the highlight exactly behind the object. Enlarging a full tinted copy produced a
        // translucent duplicate that looked like a motion trail beside trees and rocks.
        const groundOrigin = 1;
        outline = this.add.image(0, 0, art.texture).setOrigin(0.5, groundOrigin).setDisplaySize(art.width, art.height).setTint(0xeadb78).setAlpha(0.28).setVisible(false);
        const sprite = this.add.image(0, 0, art.texture).setOrigin(0.5, groundOrigin).setDisplaySize(art.width, art.height).setVisible(!art.paintedIntoTerrain);
        const barY = -art.height - 8;
        const barFrame = this.add.rectangle(0, barY, RESOURCE_BAR_WIDTH, 5, 0x0b1512, 0.92).setStrokeStyle(1, 0x000000, 0.75).setVisible(false);
        const barFill = this.add.rectangle(-RESOURCE_BAR_WIDTH / 2 + 1, barY, RESOURCE_BAR_WIDTH - 2, 3, 0x9eaa63).setOrigin(0, 0.5).setVisible(false);
        const children: Phaser.GameObjects.GameObject[] = [outline, sprite, barFrame, barFill];
        if (object.type === "looseStone") {
          const korean = this.game.canvas.parentElement?.dataset.language === "ko";
          const guide = this.add.text(0, -art.height - 12, korean ? "돌 · 클릭해서 줍기" : "Stone · click to gather", {
            color: "#f3e7ac",
            backgroundColor: "#07110ed9",
            fontFamily: "KoPubWorld Dotum, sans-serif",
            fontSize: "11px",
            padding: { x: 7, y: 4 },
          }).setOrigin(0.5, 1).setVisible(this.isBowEquipped() && !this.hasArrow());
          children.push(guide);
          this.stoneGuideLabels.push(guide);
        }
        const container = this.add.container(object.x, object.y, children).setDepth(10 + object.y / WORLD_HEIGHT);
        const entity = { container, sprite, outline, hitArea, fill: barFill, frame: barFrame, baseScaleX: sprite.scaleX, baseScaleY: sprite.scaleY };
        this.resources.set(object.id, entity);
        this.worldObjects.push(container);
        if (art.sway) {
          this.tweens.add({ targets: sprite, rotation: art.sway, duration: Phaser.Math.Between(1800, 2800), yoyo: true, repeat: -1, ease: "Sine.InOut", delay: Phaser.Math.Between(0, 900) });
        } else if (object.type.endsWith("OreDeposit") || object.type === "coalDeposit") {
          this.tweens.add({ targets: sprite, alpha: 0.88, duration: Phaser.Math.Between(1900, 3100), yoyo: true, repeat: -1, ease: "Sine.InOut", delay: Phaser.Math.Between(0, 1000) });
        }
      }
      this.resourceHighlights.push({ id: object.id, x: object.x, y: object.y, outline });
    }
  }

  /** Applies the server-owned lifecycle of a resource or animal to its local visual entity. */
  private applyWorldObjectState(state: WorldObjectState) {
    if (state.zoneId !== this.zoneId) return;
    if (state.kind === "resource") {
      const resource = this.resources.get(state.objectId);
      if (!resource) return;
      resource.respawn?.destroy();
      resource.respawn = undefined;
      const exhausted = state.exhaustedUntil > Date.now() || state.remaining <= 0;
      if (exhausted && this.activeMining?.id === state.objectId) this.stopMining();
      const ratio = Phaser.Math.Clamp(state.remaining / Math.max(1, state.maximum), 0, 1);
      resource.frame.setVisible(!exhausted && ratio < 1);
      resource.fill.setVisible(!exhausted && ratio < 1).setScale(ratio, 1);
      resource.fill.setFillStyle(ratio > 0.5 ? 0x9eaa63 : ratio > 0.25 ? 0xc29a55 : 0xc86445);
      if (!exhausted) {
        resource.hitArea.setInteractive({ useHandCursor: true });
        resource.container.setVisible(true);
        resource.sprite.setAlpha(1).setScale(resource.baseScaleX, resource.baseScaleY).setAngle(0).clearTint();
        return;
      }
      resource.hitArea.disableInteractive();
      this.tweens.killTweensOf(resource.sprite);
      this.tweens.add({
        targets: resource.sprite,
        alpha: 0.16,
        scaleX: resource.baseScaleX * 0.88,
        scaleY: resource.baseScaleY * 0.72,
        angle: state.objectId.includes("timber") ? 7 : 0,
        duration: 420,
        ease: "Quad.In",
      });
      const wait = Math.max(0, state.exhaustedUntil - Date.now());
      resource.respawn = this.time.delayedCall(wait, () => {
        if (!resource.container.active || state.zoneId !== this.zoneId) return;
        resource.hitArea.setInteractive({ useHandCursor: true });
        resource.frame.setVisible(false);
        resource.fill.setVisible(false);
        resource.sprite.setAlpha(0).setScale(resource.baseScaleX, resource.baseScaleY).setAngle(0);
        this.tweens.add({ targets: resource.sprite, alpha: 1, duration: 700, ease: "Sine.Out" });
      });
      return;
    }

    const animal = this.animals.get(state.objectId);
    if (!animal) return;
    const defeated = state.defeatedUntil > Date.now() || state.health <= 0;
    const ratio = Phaser.Math.Clamp(state.health / Math.max(1, state.maximumHealth), 0, 1);
    animal.frame.setVisible(!defeated && ratio < 1);
    animal.fill.setVisible(!defeated && ratio < 1).setScale(ratio, 1);
    if (defeated) {
      animal.container.setVisible(false);
      if (this.engagedTarget === state.objectId) this.disengage();
      const wait = Math.max(0, state.defeatedUntil - Date.now());
      this.time.delayedCall(wait, () => {
        if (!animal.container.active || state.zoneId !== this.zoneId) return;
        animal.container.setVisible(true).setAlpha(0).setAngle(0);
        animal.sprite.clearTint();
        this.tweens.add({ targets: animal.container, alpha: 1, duration: 650, ease: "Sine.Out" });
      });
    } else {
      animal.container.setVisible(true).setAlpha(1).setAngle(0);
    }
  }

  /** Fish are attached to one water object, so none can drift onto dry terrain. Habitat data changes
   * their size and colour from one ecological band to the next. */
  private createPondLife(pondX: number, pondY: number, zoneId: string, waterType: string) {
    const river = waterType === "riverFishingWater";
    const habitats = getZoneDefinition(zoneId)?.ecology.hydrology.fishHabitats ?? [];
    const fishCount = river ? 5 : 8;
    const palette = [0xd6c08d, 0x9fc5b0, 0xb3a6d1, 0xd18e71, 0x8cb4cf, 0xb9c56f];
    for (let index = 0; index < fishCount; index += 1) {
      const angle = (index / fishCount) * Math.PI * 2;
      const radius = river ? 9 + (index % 3) * 7 : 16 + (index % 4) * 10;
      const habitat = habitats[index % Math.max(1, habitats.length)] ?? `${zoneId}.${index}`;
      const fish = this.add.sprite(pondX + Math.cos(angle) * radius, pondY + Math.sin(angle) * radius * 0.42, "wildlife.pondFish", index % 4)
        .setOrigin(0.5)
        .setDisplaySize((river ? 17 : 22) + (index % 3) * 4, (river ? 17 : 22) + (index % 3) * 4)
        .setDepth(9.2 + (pondY + index) / WORLD_HEIGHT)
        .setAlpha(0.76)
        .setTint(palette[stableNumber(habitat) % palette.length]!);
      fish.setData("baseScaleX", fish.scaleX).setData("baseScaleY", fish.scaleY);
      this.worldObjects.push(fish);
      this.scheduleFishMovement(fish, pondX, pondY, zoneId, angle, index, river);
    }
    for (let index = 0; index < 3; index += 1) {
      const ripple = this.add.ellipse(pondX + (index - 1) * (river ? 17 : 31), pondY + (index % 2 ? (river ? 6 : 15) : (river ? -5 : -12)), 12, 4, 0x9dd8c8, 0).setStrokeStyle(0.8, 0xb9e5d5, 0.28).setDepth(9.15);
      this.worldObjects.push(ripple);
      this.tweens.add({ targets: ripple, scaleX: 2.4, scaleY: 1.8, alpha: 0, duration: 2400 + index * 500, delay: index * 700, repeat: -1, ease: "Sine.Out" });
    }
  }

  /** Ambient birds use their own sky layer and never share the ground-animal movement system. */
  private createAmbientBirdFlock(objectId: string, startX: number, startY: number, zoneId: string, species: string) {
    const colours: Record<string, number> = { Gull: 0xe8efed, Heron: 0xb7c1bc, Crane: 0xd9d7c9, Parrot: 0xb5d5a7, Hornbill: 0xd8b77b, Eagle: 0xd2b18d, Hawk: 0xe0c2a1, Falcon: 0xc9c1b7, Vulture: 0xa69b8f, Crow: 0x687175, Owl: 0xb8a38e };
    const colour = colours[species] ?? 0xd6c9ae;
    const largeRaptor = species === "Eagle" || species === "Vulture";
    const profile = BIRD_PROFILES[species] ?? BIRD_PROFILES.Hawk!;
    const members: Phaser.GameObjects.Sprite[] = [];
    for (let index = 0; index < 3; index += 1) {
      const bird = this.add.sprite(-index * 58, index === 1 ? 30 : index === 2 ? -24 : 0, "wildlife.ambientBird")
        .setOrigin(0.5)
        .setDisplaySize(largeRaptor ? 88 : species === "Gull" || species === "Crane" ? 74 : 66, largeRaptor ? 62 : species === "Gull" || species === "Crane" ? 52 : 46)
        .setTint(colour)
        .setDepth(28)
        .setAlpha(0.94);
      const baseScaleY = bird.scaleY;
      this.tweens.add({ targets: bird, scaleY: baseScaleY * 0.68, angle: index % 2 === 0 ? 1.8 : -1.8, duration: 380 + index * 40, yoyo: true, repeat: -1, ease: "Sine.InOut" });
      members.push(bird);
    }
    const primary = members[0]!;
    const outline = this.add.sprite(primary.x, primary.y, "wildlife.ambientBird").setOrigin(0.5)
      .setDisplaySize(primary.displayWidth + 7, primary.displayHeight + 7).setTint(0xf2df72).setAlpha(0.82).setVisible(false);
    const barY = -profile.displayHeight - 12;
    const barFrame = this.add.rectangle(0, barY, HEALTH_BAR_WIDTH, 5, 0x0b1512, 0.9).setStrokeStyle(1, 0x000000, 0.7).setVisible(false);
    const barFill = this.add.rectangle(-HEALTH_BAR_WIDTH / 2 + 1, barY, HEALTH_BAR_WIDTH - 2, 3, 0xb8523f).setOrigin(0, 0.5).setVisible(false);
    const flock = this.add.container(startX, startY, [outline, ...members.slice(1), primary, barFrame, barFill]).setDepth(28);
    this.animals.set(objectId, { container: flock, sprite: primary, outline, members, fill: barFill, frame: barFrame, profile });
    primary.setInteractive({ useHandCursor: true })
      .on("pointerover", () => this.showHover(flock.x, flock.y, primary.displayWidth * 1.2, primary.displayHeight * 1.2, profile.label, outline))
      .on("pointerout", () => { if (this.engagedTarget !== objectId) this.hideHover(outline); })
      .on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation();
        const doubleClicked = this.lastAnimalClick.id === objectId && this.time.now - this.lastAnimalClick.at < DOUBLE_CLICK_MS;
        this.lastAnimalClick = { id: objectId, at: this.time.now };
        if (doubleClicked) this.engageAnimal(objectId); else this.markAnimal(objectId);
      });
    this.tweens.add({ targets: flock, x: WORLD_WIDTH + 140, y: startY - 42, duration: 19000, repeat: -1, ease: "Linear", onRepeat: () => { if (this.zoneId !== zoneId) flock.setVisible(false); } });
    this.worldObjects.push(flock);
  }

  private scheduleFishMovement(fish: Phaser.GameObjects.Sprite, pondX: number, pondY: number, zoneId: string, phase: number, index: number, river: boolean) {
    const nextPhase = phase + Phaser.Math.FloatBetween(0.45, 1.05);
    const schoolPulse = this.time.now / 4200;
    const radiusX = river ? 12 + (index % 3) * 5 : 24 + (index % 5) * 8;
    const radiusY = river ? 4 + (index % 3) * 2 : 9 + (index % 4) * 5;
    const targetX = pondX + Math.cos(nextPhase + schoolPulse) * radiusX;
    const targetY = pondY + Math.sin(nextPhase + schoolPulse) * radiusY;
    // The source fish face left. Flip only when the destination is to their right; movement never
    // starts until the nose points toward the destination, so they cannot slide sideways.
    const baseScaleX = Number(fish.getData("baseScaleX") ?? Math.abs(fish.scaleX));
    const baseScaleY = Number(fish.getData("baseScaleY") ?? fish.scaleY);
    fish.setScale(baseScaleX * (targetX >= fish.x ? -1 : 1), baseScaleY);
    this.tweens.add({
      targets: fish,
      x: targetX,
      y: targetY,
      angle: Phaser.Math.FloatBetween(-4, 4),
      duration: Phaser.Math.Between(1200, 2600),
      ease: "Sine.InOut",
      onComplete: () => {
        if (!fish.active || this.zoneId !== zoneId) return;
        this.time.delayedCall(Phaser.Math.Between(180, 900), () => this.scheduleFishMovement(fish, pondX, pondY, zoneId, nextPhase, index, river));
      },
    });
  }

  /** A single click only rings the animal, so a misclick does not start a hunt. */
  private markAnimal(objectId: string) {
    const animal = this.animals.get(objectId);
    if (!animal) return;
    for (const candidate of this.animals.values()) candidate.outline.setVisible(false);
    animal.outline.setVisible(true);
  }

  /** Double-clicking sets the hunt: the wanderer closes the distance and keeps swinging. */
  private engageAnimal(objectId: string) {
    const animal = this.animals.get(objectId);
    if (!animal) return;
    if (animal.profile.flying && !this.isBowEquipped()) {
      window.dispatchEvent(new CustomEvent("eldoria:interact", { detail: { objectId, x: animal.container.x, y: animal.container.y } }));
      return;
    }
    this.tweens.killTweensOf(animal.container);
    this.engagedTarget = objectId;
    this.nextStrikeAt = 0;
    this.nextRepathAt = 0;
    this.pendingInteraction = undefined;
    for (const candidate of this.animals.values()) candidate.outline.setVisible(false);
    animal.outline.setVisible(true);
    this.engagedMark ??= this.createCrossedBlades();
    this.engagedMark.setVisible(true);
    this.weaponBadge?.destroy();
    this.weaponBadge = this.createFistBadge().setVisible(true);
    this.player?.add(this.weaponBadge);
    // Show the bar full the moment the hunt starts, rather than waiting for the first landed blow —
    // a refused swing never returns a health payload, so the bar would otherwise never appear at all.
    animal.frame.setVisible(true);
    animal.fill.setVisible(true).setScale(1, 1).setFillStyle(0xb8523f);
  }

  /** A compact item silhouette above the fighter; equipment names belong in the inventory, not here. */
  private createFistBadge(): Phaser.GameObjects.Container {
    const badge = this.add.container(0, -104);
    badge.add(this.add.circle(0, 0, 14, 0x0b1512, 0.9).setStrokeStyle(1.2, 0xd3c37f, 0.8));
    const equipped = this.game.canvas.parentElement?.dataset.equipped ?? "";
    const art = heldItemArt(equipped);
    if (art && this.textures.exists(art.key)) {
      const icon = this.add.image(0, 0, art.key);
      const source = this.textures.get(art.key).getSourceImage();
      const height = 21;
      icon.setDisplaySize((height * source.width) / source.height, height);
      badge.add(icon);
    } else {
      const fist = this.add.graphics();
      fist.fillStyle(0xe2c18d, 1).fillRoundedRect(-7, -5, 13, 10, 3);
      fist.fillStyle(0xc99f6d, 1).fillRoundedRect(-4, 3, 8, 6, 3);
      badge.add(fist);
    }
    return badge;
  }

  /**
   * Carries the equipped item in the hand. A single drawing is enough because the hand's position is
   * known for every pose: the item is moved onto that point each frame, so it swings with the arm.
   */
  private syncHeldItem() {
    const sprite = this.playerSprite;
    if (!this.heldItem || !sprite) return;
    if (this.time.now < this.heldItemHiddenUntil) {
      this.heldItem.setVisible(false);
      return;
    }
    const equipped = this.game.canvas.parentElement?.dataset.equipped ?? "";
    const art = heldItemArt(equipped);
    if (!art || !this.textures.exists(art.key)) {
      this.heldItem.setVisible(false);
      this.heldItemId = "";
      return;
    }
    if (this.heldItemId !== equipped) {
      this.heldItemId = equipped;
      this.heldItem.setTexture(art.key);
    }
    const frameIndex = Number.parseInt(sprite.frame.name, 10) || 0;
    const vertical = sprite.texture.key === this.verticalWalkTexture;
    const anchors = vertical ? VERTICAL_HAND_ANCHORS : HAND_ANCHORS[this.sideWalkTexture];
    const pose = anchors?.[frameIndex % anchors.length] ?? anchors?.[0];
    if (!pose) {
      this.heldItem.setVisible(false);
      return;
    }
    const itemFlipped = vertical ? frameIndex >= 8 : sprite.flipX;
    const visualFlip = art.key === "item.bow" ? !itemFlipped : itemFlipped;
    // Phaser preserves the configured origin while flipping the rendered pixels. Mirroring the origin
    // a second time detached the handle from the wrist in front/back poses.
    this.heldItem.setOrigin(art.grip[0], art.grip[1]);
    const source = this.textures.get(art.key).getSourceImage();
    this.heldItem.setDisplaySize((art.height * source.width) / source.height, art.height);
    const rotationSide = itemFlipped ? -1 : 1;
    const width = sprite.frame.width * sprite.scaleX;
    const height = sprite.frame.height * sprite.scaleY;
    // Side frames are authored facing right. Mirroring the body must mirror its anatomical right-hand
    // anchor as well; keeping the original X coordinate left the tool floating behind the shoulder.
    // Vertical sheets already contain separate front/back right-hand coordinates.
    const handOffsetX = this.rightHandOffsetX(pose.fx, width, vertical, sprite.flipX);
    this.heldItem
      .setPosition(sprite.x + handOffsetX, sprite.y + (pose.fy - 1) * height)
      .setFlipX(visualFlip)
      .setRotation(sprite.rotation + rotationSide * (pose.angle + (vertical ? 0 : art.outwardAngle ?? 0)))
      .setVisible(true);
    // Seen from behind, the hand and torso occlude the grip. From the front the tool stays visible.
    if (vertical && frameIndex < 8) this.player?.moveBelow(this.heldItem, sprite);
    else this.player?.moveAbove(this.heldItem, sprite);
  }

  /** Only the anatomical right-hand anchor may carry equipment, mirrored with the side-view body. */
  private rightHandOffsetX(anchorX: number, frameWidth: number, vertical: boolean, facingLeft: boolean) {
    const authoredRightHand = (anchorX - 0.5) * frameWidth;
    return vertical || !facingLeft ? authoredRightHand : -authoredRightHand;
  }

  /**
   * Brings the rig in line with what the character is wearing. A slot whose art has not been drawn yet
   * is simply left empty — the figure renders as a body alone rather than as a body with a guess
   * painted over it.
   */
  private syncEquipmentLayers() {
    const equipment = this.game.canvas.parentElement?.dataset.equipment ?? "";
    if (!this.rig || equipment === this.riggedEquipment) return;
    this.riggedEquipment = equipment;
    const worn: Record<string, string> = equipment ? (JSON.parse(equipment) as Record<string, string>) : {};
    const female = this.sideWalkTexture === "player.female.walk";
    for (const definition of ["legs", "feet", "torso", "head", "offHand", "mainHand"] as const) {
      const itemId = worn[definition];
      const sheet: LayerSheet | undefined = itemId ? equipmentLayerSheets[`${itemId}:${female ? "female" : "male"}`] ?? equipmentLayerSheets[itemId] : undefined;
      if (!sheet || !this.textures.exists(sheet.textureKey)) {
        this.rig.detach(definition);
        continue;
      }
      if (!this.rig.has(definition)) this.rig.attach(definition, sheet, this.playerSprite?.scaleY ?? 0.16);
    }
  }

  /** Crossed blades over the quarry, so the hunted animal is never in doubt. */
  private createCrossedBlades(): Phaser.GameObjects.Container {
    const mark = this.add.container(0, 0).setDepth(12);
    for (const lean of [-1, 1] as const) {
      const blade = this.add.container(0, 0);
      blade.add(this.add.rectangle(0, -2, 1.6, 11, 0xe8e2c6).setStrokeStyle(0.6, 0x2b2a20, 0.9));
      blade.add(this.add.triangle(0, -8.5, 0, 3.4, 1.7, 0, 3.4, 3.4, 0xe8e2c6).setOrigin(0.5));
      blade.add(this.add.rectangle(0, 4.5, 6, 1.4, 0xb8a45f));
      blade.add(this.add.rectangle(0, 7, 1.6, 4, 0x6a5836));
      blade.setRotation(lean * 0.62);
      mark.add(blade);
    }
    this.tweens.add({ targets: mark, scale: 1.1, duration: 700, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    return mark;
  }

  private disengage() {
    this.engagedTarget = undefined;
    for (const animal of this.animals.values()) animal.outline.setVisible(false);
    this.engagedMark?.setVisible(false);
    this.weaponBadge?.setVisible(false);
  }

  /**
   * Walking used to be a straight line at the destination, so any wall in between simply stopped the
   * journey — which is why the eastern zones were unreachable: a ridge crosses the middle of the wilds
   * and the exit sits behind it. This routes around the terrain instead.
   */
  private walkTo(x: number, y: number) {
    const zone = getZoneDefinition(this.zoneId);
    if (!zone) return;
    const requested = new Phaser.Math.Vector2(
      Phaser.Math.Clamp(x, 30, zone.width - 30),
      Phaser.Math.Clamp(y, 45, zone.height - 25),
    );
    const destination = this.nearestWalkableDestination(requested, zone);
    this.journeyDestination = destination.clone();
    this.pathQueue = this.findPath(this.target, destination, zone);
    this.clickTarget = this.pathQueue.shift() ?? destination;
    this.lastPathRefreshAt = this.time.now + 280;
    this.destinationMarker?.setPosition(destination.x, destination.y).setVisible(true);
  }

  private refreshJourneyPath(zone: NonNullable<ReturnType<typeof getZoneDefinition>>) {
    if (!this.journeyDestination) return;
    this.pathQueue = this.findPath(this.target, this.journeyDestination, zone);
    this.clickTarget = this.pathQueue.shift() ?? this.journeyDestination.clone();
    this.lastPathRefreshAt = this.time.now + 360;
  }

  private nearestWalkableDestination(requested: Phaser.Math.Vector2, zone: NonNullable<ReturnType<typeof getZoneDefinition>>) {
    if (this.isSceneWalkable(requested.x, requested.y)) return requested;
    for (let radius = 18; radius <= zone.tileSize * 4; radius += 18) {
      for (let sample = 0; sample < 16; sample += 1) {
        const angle = sample / 16 * Math.PI * 2;
        const x = Phaser.Math.Clamp(requested.x + Math.cos(angle) * radius, 30, zone.width - 30);
        const y = Phaser.Math.Clamp(requested.y + Math.sin(angle) * radius, 45, zone.height - 25);
        if (this.isSceneWalkable(x, y)) return new Phaser.Math.Vector2(x, y);
      }
    }
    return this.target.clone();
  }

  private isSceneWalkable(x: number, y: number) {
    const onBridge = [...this.builtStructures.values()].some((building) => building.visible && building.getData("structureType") === "wood-bridge" && Math.abs(x - building.x) <= 88 && Math.abs(y - building.y) <= 20);
    // The character occupies ground with both feet; checking only the centre let the body visibly
    // overlap a pond or cliff while its anchor still touched one dry pixel. Every sample below must
    // remain on ordinary walkable ground (road, grass, soil or sand). A player-built bridge is the
    // sole exception that deliberately carries the footprint across water.
    const footSamples = [[0, 0], [-18, 0], [18, 0], [0, -11], [0, 11], [-13, -8], [13, -8], [-13, 8], [13, 8]] as const;
    if (!onBridge && footSamples.some(([offsetX, offsetY]) => !isPositionWalkable(this.zoneId, x + offsetX, y + offsetY))) return false;
    for (const building of this.builtStructures.values()) {
      if (!building.visible) continue;
      if (building.getData("structureType") === "wood-bridge") continue;
      const dx = (x - building.x) / 82;
      const dy = (y - building.y) / 38;
      if (dx * dx + dy * dy < 1) return false;
    }
    return true;
  }

  private findPath(from: Phaser.Math.Vector2, to: Phaser.Math.Vector2, zone: NonNullable<ReturnType<typeof getZoneDefinition>>): Phaser.Math.Vector2[] {
    const { tileSize, columns, rows } = zone;
    const toTile = (point: Phaser.Math.Vector2) => ({ tx: Phaser.Math.Clamp(Math.floor(point.x / tileSize), 0, columns - 1), ty: Phaser.Math.Clamp(Math.floor(point.y / tileSize), 0, rows - 1) });
    const centre = (tx: number, ty: number) => new Phaser.Math.Vector2(tx * tileSize + tileSize / 2, ty * tileSize + tileSize / 2);
    const open = (tx: number, ty: number) => this.isSceneWalkable(tx * tileSize + tileSize / 2, ty * tileSize + tileSize / 2);
    const start = toTile(from);
    let goal = toTile(to);
    // The requested point can be clear while its 32px tile centre still falls under a house eave or
    // tree footprint. A* works on centres, so choose the nearest open centre and finish with the
    // precise requested point; otherwise it falsely reports no route and walks straight into water.
    if (!open(goal.tx, goal.ty)) {
      let replacement: { tx: number; ty: number } | undefined;
      for (let radius = 1; radius <= 5 && !replacement; radius += 1) {
        const candidates: Array<{ tx: number; ty: number }> = [];
        for (let dx = -radius; dx <= radius; dx += 1) {
          candidates.push({ tx: goal.tx + dx, ty: goal.ty - radius }, { tx: goal.tx + dx, ty: goal.ty + radius });
        }
        for (let dy = -radius + 1; dy < radius; dy += 1) {
          candidates.push({ tx: goal.tx - radius, ty: goal.ty + dy }, { tx: goal.tx + radius, ty: goal.ty + dy });
        }
        replacement = candidates
          .filter((candidate) => candidate.tx >= 0 && candidate.ty >= 0 && candidate.tx < columns && candidate.ty < rows && open(candidate.tx, candidate.ty))
          .sort((left, right) => Phaser.Math.Distance.Between(left.tx, left.ty, to.x / tileSize, to.y / tileSize) - Phaser.Math.Distance.Between(right.tx, right.ty, to.x / tileSize, to.y / tileSize))[0];
      }
      if (replacement) goal = replacement;
    }
    if (start.tx === goal.tx && start.ty === goal.ty) return [to];

    const key = (tx: number, ty: number) => ty * columns + tx;
    const cameFrom = new Map<number, number>();
    const cost = new Map<number, number>([[key(start.tx, start.ty), 0]]);
    // A grid this small does not need a heap; a re-sorted frontier stays well inside one frame.
    const frontier: Array<{ tx: number; ty: number; priority: number }> = [{ ...start, priority: 0 }];
    let reached: { tx: number; ty: number } | null = null;
    while (frontier.length > 0) {
      frontier.sort((left, right) => left.priority - right.priority);
      const current = frontier.shift()!;
      if (current.tx === goal.tx && current.ty === goal.ty) { reached = current; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        const tx = current.tx + dx;
        const ty = current.ty + dy;
        if (tx < 0 || ty < 0 || tx >= columns || ty >= rows || !open(tx, ty)) continue;
        // Refuse to cut a corner through the gap between two blocked tiles.
        if (dx !== 0 && dy !== 0 && (!open(current.tx + dx, current.ty) || !open(current.tx, current.ty + dy))) continue;
        const next = key(tx, ty);
        const stepCost = (cost.get(key(current.tx, current.ty)) ?? 0) + (dx !== 0 && dy !== 0 ? 1.414 : 1);
        if (cost.has(next) && stepCost >= cost.get(next)!) continue;
        cost.set(next, stepCost);
        cameFrom.set(next, key(current.tx, current.ty));
        frontier.push({ tx, ty, priority: stepCost + Math.hypot(goal.tx - tx, goal.ty - ty) });
      }
    }
    if (!reached) return [to];

    const tiles: Array<{ tx: number; ty: number }> = [];
    let cursor: number | undefined = key(reached.tx, reached.ty);
    while (cursor !== undefined) {
      tiles.unshift({ tx: cursor % columns, ty: Math.floor(cursor / columns) });
      cursor = cameFrom.get(cursor);
    }
    // String-pull: keep only the corners, so the walk is a line where a line will do.
    const waypoints: Phaser.Math.Vector2[] = [];
    let anchor = from;
    for (let index = 1; index < tiles.length; index += 1) {
      const point = centre(tiles[index]!.tx, tiles[index]!.ty);
      if (this.hasClearLine(anchor, point)) continue;
      const previous = centre(tiles[index - 1]!.tx, tiles[index - 1]!.ty);
      waypoints.push(previous);
      anchor = previous;
    }
    waypoints.push(to);
    return waypoints;
  }

  private hasClearLine(from: Phaser.Math.Vector2, to: Phaser.Math.Vector2): boolean {
    const steps = Math.ceil(Phaser.Math.Distance.BetweenPoints(from, to) / 12);
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      if (!this.isSceneWalkable(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio)) return false;
    }
    return true;
  }

  private pursueEngagedAnimal() {
    if (!this.engagedTarget) return;
    const animal = this.animals.get(this.engagedTarget);
    if (!animal || !animal.container.visible) {
      this.disengage();
      return;
    }
    animal.outline.setVisible(true);
    const markHeight = animal.profile.displayHeight;
    this.engagedMark?.setPosition(animal.container.x, animal.container.y - markHeight - 14).setVisible(true);
    const ranged = this.isBowEquipped();
    const attackReach = ranged ? 360 : STRIKE_REACH;
    const breakOff = ranged ? 410 : STRIKE_BREAK_OFF;
    const reach = Phaser.Math.Distance.Between(this.target.x, this.target.y, animal.container.x, animal.container.y);
    const closing = this.clickTarget !== undefined;
    if (reach > (closing ? attackReach : breakOff)) {
      // The quarry keeps moving, so the route is refreshed rather than plotted once and trusted.
      if (this.time.now >= this.nextRepathAt) {
        this.nextRepathAt = this.time.now + 500;
        this.walkTo(animal.container.x, animal.container.y);
      }
      return;
    }
    this.clickTarget = undefined;
    this.pathQueue = [];
    this.journeyDestination = undefined;
    this.destinationMarker?.setVisible(false);
    if (this.time.now < this.nextStrikeAt) return;
    this.nextStrikeAt = this.time.now + STRIKE_INTERVAL_MS;
    // Swing on the attempt, not on the reply. The server may refuse the blow outright — a stag will
    // not be taken bare-handed — and the wanderer should still be seen throwing the punch.
    if (ranged && this.hasArrow()) this.playBowShot(this.engagedTarget, animal.container.x, animal.container.y - animal.profile.displayHeight * 0.4);
    else if (ranged) window.dispatchEvent(new CustomEvent("eldoria:interact", { detail: { objectId: this.engagedTarget, x: animal.container.x, y: animal.container.y } }));
    else {
      this.playStrikeMotion(animal.container.x);
      window.dispatchEvent(new CustomEvent("eldoria:interact", { detail: { objectId: this.engagedTarget, x: animal.container.x, y: animal.container.y } }));
    }
  }

  private isBowEquipped() {
    const equipped = this.game.canvas.parentElement?.dataset.equipped ?? "";
    return equipped.endsWith("-bow");
  }

  private hasArrow() {
    return Number(this.game.canvas.parentElement?.dataset.arrowCount ?? 0) > 0;
  }

  private playBowShot(objectId: string, targetX: number, targetY: number) {
    if (!this.player || !this.playerSprite) return;
    const startX = this.player.x + (targetX >= this.player.x ? 18 : -18);
    const startY = this.player.y - 48;
    const angle = Phaser.Math.Angle.Between(startX, startY, targetX, targetY);
    this.playerSprite.setFlipX(targetX < this.player.x);
    const glow = this.add.rectangle(-7, 0, 68, 10, 0xf5d77b, 0.18);
    const projectile = this.add.image(0, 0, "item.arrow").setDisplaySize(68, 17);
    const arrow = this.add.container(startX, startY, [glow, projectile]).setRotation(angle).setDepth(50);
    const distance = Phaser.Math.Distance.Between(startX, startY, targetX, targetY);
    this.tweens.add({
      targets: arrow,
      x: targetX,
      y: targetY,
      duration: Phaser.Math.Clamp(distance * 1.8, 360, 760),
      ease: "Linear",
      onComplete: () => {
        arrow.destroy();
        if (this.engagedTarget === objectId) window.dispatchEvent(new CustomEvent("eldoria:interact", { detail: { objectId, x: targetX, y: targetY } }));
      },
    });
  }

  private handleMiningClick(id: string, x: number, y: number, type: string, nativeDoubleClick = false) {
    const doubleClicked = nativeDoubleClick || (this.lastResourceClick.id === id && this.time.now - this.lastResourceClick.at < DOUBLE_CLICK_MS);
    this.lastResourceClick = { id, at: this.time.now };
    if (doubleClicked) {
      this.beginMining(id, x, y);
      return;
    }
    this.stopMining();
    const region = OBJECT_REGIONS[type] ?? DEFAULT_REGION;
    this.showHover(x, y + region.offsetY, region.width, region.height, this.contextualObjectName(type), this.resources.get(id)?.outline);
  }

  /** A double-click commits to a vein and keeps swinging until the player moves, changes tools, or it empties. */
  private beginMining(id: string, x: number, y: number) {
    const equipped = this.game.canvas.parentElement?.dataset.equipped ?? "";
    const hasPickaxe = equipped === "tool.pickaxe" || equipped.endsWith("-pickaxe");
    if (!hasPickaxe) {
      this.stopMining();
      this.requestInteraction(id, x, y);
      return;
    }
    // Phaser's second pointerdown and the browser's native dblclick describe the same gesture.
    // Once this vein is active, ignore the duplicate callback so one double-click cannot grant two hits.
    if (this.activeMining?.id === id) return;
    const reach = 150;
    this.activeMining = { id, x, y, reach, nextAt: Number.POSITIVE_INFINITY };
    window.dispatchEvent(new CustomEvent("eldoria:mining-status", { detail: "자동 채광을 시작했습니다. 이동하거나 도구를 바꾸면 중단됩니다." }));
    const started = this.requestInteraction(id, x, y);
    if (started && this.activeMining) {
      this.activeMining.nextAt = this.time.now + MINING_INTERVAL_MS;
      window.dispatchEvent(new CustomEvent("eldoria:mining-start", { detail: { objectId: id, intervalMs: MINING_INTERVAL_MS } }));
    }
  }

  private stopMining() {
    if (this.activeMining) window.dispatchEvent(new CustomEvent("eldoria:mining-stop"));
    this.activeMining = undefined;
  }

  private requestInteraction(id: string, x: number, y: number): boolean {
    const object = getZoneDefinition(this.zoneId)?.layers.objects.find((candidate) => candidate.id === id);
    // Water is approached from its bank. Its interaction reach must extend beyond the solid water
    // footprint or pathfinding correctly stops at shore but the cast can never begin.
    const reach = object?.type === "fishingWater" ? 180
      : object?.type === "riverFishingWater" ? 145
      : isMiningObjectType(object?.type) ? 150
      : object?.type === "animalDenEntrance" || object?.type === "animalDenExit" ? 92
        : object?.type === "wildTree" || object?.type === "wildFruitTree" ? 76
          : 62;
    const distance = Phaser.Math.Distance.Between(this.target.x, this.target.y, x, y);
    if (distance <= reach) {
      window.dispatchEvent(new CustomEvent("eldoria:interact", { detail: { objectId: id } }));
      return true;
    }
    const angle = Phaser.Math.Angle.Between(x, y, this.target.x, this.target.y);
    const approachDistance = Math.max(30, reach - 12);
    const approach = new Phaser.Math.Vector2(x + Math.cos(angle) * approachDistance, y + Math.sin(angle) * approachDistance);
    this.pendingInteraction = { id, x, y, reach };
    this.walkTo(approach.x, approach.y);
    return false;
  }

  /**
   * Water is an area, not a tiny object hotspot. The generous shore ellipse lets a cast begin from
   * any visible bank around a pond or any adjacent stretch of river while still excluding open land.
   */
  private fishingWaterNear(x: number, y: number) {
    const zone = getZoneDefinition(this.zoneId);
    if (!zone) return undefined;
    return zone.layers.objects.find((object) => {
      if (object.type !== "fishingWater" && object.type !== "riverFishingWater") return false;
      const radiusX = object.type === "fishingWater" ? 165 : 135;
      const radiusY = object.type === "fishingWater" ? 100 : 85;
      const dx = (x - object.x) / radiusX;
      const dy = (y - object.y) / radiusY;
      return dx * dx + dy * dy <= 1;
    });
  }

  /**
   * Animals obey the same ground mask as the player, but their whole stride is sampled so they cannot
   * tween across a river merely because the landing point is dry. Pond turtles additionally remain in
   * a shoreline band; land animals keep to ordinary walkable meadow.
   */
  private isAnimalRouteOpen(profile: AnimalProfile, zoneId: string, fromX: number, fromY: number, toX: number, toY: number) {
    const zone = getZoneDefinition(zoneId);
    if (!zone) return false;
    const routeLength = Phaser.Math.Distance.Between(fromX, fromY, toX, toY);
    const samples = Math.max(2, Math.ceil(routeLength / 14));
    for (let index = 1; index <= samples; index += 1) {
      const ratio = index / samples;
      const x = Phaser.Math.Linear(fromX, toX, ratio);
      const y = Phaser.Math.Linear(fromY, toY, ratio);
      if (!isPositionWalkable(zoneId, x, y)) return false;
      if (profile.key === "turtle") {
        const shoreDistance = Math.min(...zone.layers.objects.filter((object) => object.type === "fishingWater").map((pond) => Phaser.Math.Distance.Between(x, y, pond.x, pond.y)));
        if (!Number.isFinite(shoreDistance) || shoreDistance < 105 || shoreDistance > 205) return false;
      }
    }
    return true;
  }

  /**
   * Side-view animals commit to one horizontal line for the whole walk. They stop and turn before
   * reversing; they never drift diagonally or bend their route while the same gait is playing.
   */
  private scheduleAnimalMovement(animal: Phaser.GameObjects.Container, members: Phaser.GameObjects.Sprite[], profile: AnimalProfile, homeX: number, homeY: number, zoneId: string, state: { heading: number; stepsRemaining: number; alert: number }, objectId: string) {
    const resting = state.stepsRemaining <= 0;
    if (resting) {
      const towardHome = Phaser.Math.Angle.Between(animal.x, animal.y, homeX, homeY);
      const strayed = Phaser.Math.Distance.Between(animal.x, animal.y, homeX, homeY) > profile.homeRange;
      if (strayed) state.heading = Math.cos(towardHome) >= 0 ? 0 : Math.PI;
      else if (Phaser.Math.FloatBetween(0, 1) < 0.48) state.heading = Math.cos(state.heading) >= 0 ? Math.PI : 0;
      state.stepsRemaining = Phaser.Math.Between(profile.society === "solitary" ? 2 : 4, profile.society === "solitary" ? 6 : 9);
    }
    const pause = resting
      ? Phaser.Math.Between(profile.rest[0], profile.rest[1])
      : Phaser.Math.Between(35, profile.society === "solitary" ? 180 : 110);
    this.time.delayedCall(pause, () => {
      if (!animal.active || this.zoneId !== zoneId) return;
      if (this.engagedTarget === objectId) {
        state.alert = 1;
        if (this.player) for (const member of members) member.setFlipX(this.player.x > animal.x);
        this.playAnimalAlert(members, profile);
        this.time.delayedCall(240, () => this.scheduleAnimalMovement(animal, members, profile, homeX, homeY, zoneId, state, objectId));
        return;
      }
      state.alert = Math.max(0, state.alert - 0.15);
      if (resting) this.grazeInPlace(members, profile);
      if (!profile.aggressive) {
        let nearestPredator: Phaser.GameObjects.Container | undefined;
        let predatorDistance = 210;
        for (const candidate of this.animals.values()) {
          if (!candidate.profile.aggressive || !candidate.container.visible) continue;
          const distance = Phaser.Math.Distance.Between(animal.x, animal.y, candidate.container.x, candidate.container.y);
          if (distance < predatorDistance) { predatorDistance = distance; nearestPredator = candidate.container; }
        }
        if (nearestPredator) {
          // Side-view prey first turns its head and body away, then commits to a forward escape run.
          state.heading = nearestPredator.x < animal.x ? 0 : Math.PI;
          state.stepsRemaining = Math.max(state.stepsRemaining, 4);
          state.alert = 1;
          this.playAnimalAlert(members, profile);
        }
      }
      // The atlas is a strict side-view walk, so its forward axis is exactly left or right. Allowing
      // even a small vertical component made the animal appear to slide sideways across the ground.
      const wantsRight = Math.cos(state.heading) >= 0;
      state.heading = wantsRight ? 0 : Math.PI;
      const wasFacingRight = Boolean(members[0]?.getData("facingRight"));
      if (wasFacingRight !== wantsRight) {
        for (const member of members) {
          member.stop().setFrame(0).setFlipX(wantsRight).setData("facingRight", wantsRight);
        }
        this.animals.get(objectId)?.outline.stop().setFrame(0).setFlipX(wantsRight);
        // Turn first, then step. Changing facing and position on the same frame reads as a side slide.
        this.time.delayedCall(150, () => this.scheduleAnimalMovement(animal, members, profile, homeX, homeY, zoneId, state, objectId));
        return;
      }
      const stride = Phaser.Math.Between(profile.stride[0], profile.stride[1]);
      const targetX = Phaser.Math.Clamp(animal.x + Math.cos(state.heading) * stride, 40, WORLD_WIDTH - 40);
      const targetY = animal.y;
      if (Math.abs(targetX - animal.x) < 4) {
        state.heading = Math.cos(state.heading) >= 0 ? Math.PI : 0;
        state.stepsRemaining = Math.max(2, state.stepsRemaining - 1);
        this.time.delayedCall(80, () => this.scheduleAnimalMovement(animal, members, profile, homeX, homeY, zoneId, state, objectId));
        return;
      }
      const blockedByAnimal = [...this.animals.entries()].some(([candidateId, candidate]) => {
        if (candidateId === objectId || !candidate.container.visible) return false;
        const personalSpace = Math.max(34, (profile.displayHeight + candidate.profile.displayHeight) * 0.48);
        return Phaser.Math.Distance.Between(targetX, targetY, candidate.container.x, candidate.container.y) < personalSpace;
      });
      if (blockedByAnimal) {
        // Do not let independent wildlife collapse into one composite-looking sprite. Turn and take a
        // later stride instead; this also keeps small hares from disappearing under turkeys and trees.
        state.heading = wantsRight ? Math.PI : 0;
        state.stepsRemaining = Math.max(1, state.stepsRemaining - 1);
        this.time.delayedCall(Phaser.Math.Between(180, 420), () => this.scheduleAnimalMovement(animal, members, profile, homeX, homeY, zoneId, state, objectId));
        return;
      }
      if (!this.isAnimalRouteOpen(profile, zoneId, animal.x, animal.y, targetX, targetY)) {
        // Turn away in two or three modest steering steps. A single 180° snap is especially obvious
        // with a pack because every follower flips on the same frame.
        state.heading = Math.cos(state.heading) >= 0 ? Math.PI : 0;
        state.stepsRemaining -= 1;
        this.time.delayedCall(Phaser.Math.Between(90, 220), () => this.scheduleAnimalMovement(animal, members, profile, homeX, homeY, zoneId, state, objectId));
        return;
      }
      const distance = Phaser.Math.Distance.Between(animal.x, animal.y, targetX, targetY);
      const duration = Math.max(420, distance / profile.speed * 1000);
      const screenHeading = Math.atan2(targetY - animal.y, targetX - animal.x);
      const gaitCycles = Math.max(2, Math.round(distance / Math.max(18, profile.stride[0] * 0.55)));
      const footPlant = profile.key === "turtle" ? 0.04 : profile.key === "rabbit" || profile.key === "hare" ? 0.28 : 0.14;
      const walkAnimation = `wildlife.${profile.key}.walk`;
      for (const member of members) member.play(walkAnimation, true);
      this.animals.get(objectId)?.outline.play(`wildlife.${profile.key}.outline.walk`, true);
      this.tweens.add({
        targets: animal,
        x: targetX,
        y: targetY,
        duration,
        // Vary forward speed at each footfall. Constant-speed translation makes static animal art
        // skate over the ground even when its body is bobbing correctly.
        ease: (progress: number) => progress - Math.sin(progress * Math.PI * 2 * gaitCycles) / (Math.PI * 2 * gaitCycles) * footPlant,
        onUpdate: (tween) => {
          members.forEach((member, index) => {
            const lateral = Number(member.getData("formationX") ?? 0);
            const trail = Number(member.getData("formationY") ?? 0) * 1.35;
            const targetLocalX = index === 0 ? 0 : -Math.cos(screenHeading) * trail - Math.sin(screenHeading) * lateral;
            const targetLocalY = index === 0 ? 0 : -Math.sin(screenHeading) * trail + Math.cos(screenHeading) * lateral * 0.42;
            member.x = Phaser.Math.Linear(member.x, targetLocalX, 0.1);
            member.y = Phaser.Math.Linear(member.y, targetLocalY, 0.16);
          });
        },
        onComplete: () => {
          for (const member of members) {
            if (!member.active) continue;
            member.stop().setFrame(0).setRotation(0).setScale(Number(member.getData("baseScaleX") ?? member.scaleX), Number(member.getData("baseScaleY") ?? member.scaleY));
          }
          const currentAnimal = this.animals.get(objectId);
          if (currentAnimal?.outline.active) currentAnimal.outline.stop().setFrame(0);
          if (!animal.active || this.zoneId !== zoneId) return;
          animal.setDepth(10 + animal.y / WORLD_HEIGHT);
          state.stepsRemaining -= 1;
          this.scheduleAnimalMovement(animal, members, profile, homeX, homeY, zoneId, state, objectId);
        },
      });
    });
  }

  /** Wolves and bears claim nearby ground. Passive wildlife never enters this path. */
  private triggerPredatorAggression() {
    if (!this.player) return;
    for (const [objectId, animal] of this.animals) {
      if (!animal.profile.aggressive || !animal.container.visible) continue;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, animal.container.x, animal.container.y);
      if (distance > (animal.profile.key === "wolf" ? 145 : 120)) continue;
      const readyAt = this.predatorCooldowns.get(objectId) ?? 0;
      if (this.time.now < readyAt) continue;
      this.predatorCooldowns.set(objectId, this.time.now + (animal.profile.key === "wolf" ? 1500 : 2200));
      window.dispatchEvent(new CustomEvent("eldoria:wildlife-aggression", { detail: { objectId } }));
    }
  }

  /** A predator hit from range closes the gap instead of freezing at the arrow impact point. */
  private pursueProvokedPredators(delta: number) {
    if (!this.player) return;
    for (const objectId of [...this.provokedPredators]) {
      const animal = this.animals.get(objectId);
      if (!animal?.container.visible || !animal.profile.aggressive) {
        this.provokedPredators.delete(objectId);
        continue;
      }
      const distance = Phaser.Math.Distance.Between(animal.container.x, animal.container.y, this.player.x, this.player.y);
      if (distance <= 82) {
        for (const member of animal.members) member.stop().setFrame(0);
        animal.outline.stop().setFrame(0);
        continue;
      }
      const step = animal.profile.speed * 1.45 * Math.min(delta, 50) / 1000;
      const directionX = (this.player.x - animal.container.x) / distance;
      const directionY = (this.player.y - animal.container.y) / distance;
      const nextX = animal.container.x + directionX * step;
      const nextY = animal.container.y + directionY * step;
      if (!this.isAnimalRouteOpen(animal.profile, this.zoneId, animal.container.x, animal.container.y, nextX, nextY)) continue;
      animal.container.setPosition(nextX, nextY).setDepth(10 + nextY / WORLD_HEIGHT);
      for (const member of animal.members) {
        member.setFlipX(directionX > 0).setData("facingRight", directionX > 0);
        member.play(`wildlife.${animal.profile.key}.walk`, true);
      }
      animal.outline.setFlipX(directionX > 0).play(`wildlife.${animal.profile.key}.outline.walk`, true);
    }
  }

  /** Group members rest at different beats; solitary animals scan farther before moving again. */
  private grazeInPlace(members: Phaser.GameObjects.Sprite[], profile: AnimalProfile) {
    members.forEach((sprite, index) => {
      const baseX = Number(sprite.getData("formationX") ?? 0);
      const baseY = Number(sprite.getData("formationY") ?? 0);
      this.tweens.add({
        targets: sprite,
        y: baseY + (profile.key === "turtle" ? 1 : 4),
        rotation: (sprite.flipX ? -1 : 1) * (profile.key === "turkey" ? 0.08 : 0.045),
        duration: Phaser.Math.Between(420, 760),
        delay: index * 130,
        yoyo: true,
        repeat: profile.society === "solitary" ? 1 : Phaser.Math.Between(1, 3),
        ease: "Sine.InOut",
        onComplete: () => sprite.setPosition(baseX, baseY).setRotation(0),
      });
    });
  }

  private playAnimalAlert(members: Phaser.GameObjects.Sprite[], profile: AnimalProfile) {
    for (const [index, sprite] of members.entries()) {
      if (this.tweens.isTweening(sprite)) continue;
      const baseY = Number(sprite.getData("formationY") ?? 0);
      this.tweens.add({ targets: sprite, y: baseY - Math.min(6, profile.lift + 2), duration: 110, delay: index * 35, yoyo: true, ease: "Quad.Out" });
    }
  }

  private createCollisionTileLayer(zoneId: string) {
    const zone = getZoneDefinition(zoneId);
    if (!zone) return;
    this.collisionLayer?.destroy();
    if (!this.textures.exists("tile.collision")) {
      const tile = this.make.graphics({ x: 0, y: 0 });
      tile.fillStyle(0xff3355, 0.24).fillRect(0, 0, worldDefinition.tileSize, worldDefinition.tileSize).generateTexture("tile.collision", worldDefinition.tileSize, worldDefinition.tileSize).destroy();
    }
    const map = this.make.tilemap({ tileWidth: worldDefinition.tileSize, tileHeight: worldDefinition.tileSize, width: zone.columns, height: zone.rows });
    const tileset = map.addTilesetImage("collision", "tile.collision", worldDefinition.tileSize, worldDefinition.tileSize, 0, 0, 0);
    if (!tileset) return;
    const layer = map.createBlankLayer(`collision.${zoneId}`, tileset, 0, 0);
    if (!layer) return;
    for (const rectangle of zone.layers.collision) {
      for (let tileY = rectangle.y; tileY < rectangle.y + rectangle.height; tileY += 1) {
        for (let tileX = rectangle.x; tileX < rectangle.x + rectangle.width; tileX += 1) layer.putTileAt(0, tileX, tileY);
      }
    }
    layer.setCollisionByExclusion([-1]).setVisible(false);
    this.collisionLayer = layer;
  }

  /** The actual butchered meat remains on the ground until the player walks over and picks it up. */
  private createLootDrop(objectId: string, reward: { itemId: string; quantity: number }) {
    const source = this.animals.get(objectId)?.container;
    if (!source) return;
    const language = this.game.canvas.parentElement?.dataset.language === "ko" ? "ko" : "en";
    const drop = this.add.container(source.x, source.y - 2).setDepth(12).setSize(54, 42)
      .setInteractive(new Phaser.Geom.Rectangle(-27, -21, 54, 42), Phaser.Geom.Rectangle.Contains)
      .setData("useHandCursor", true);
    if (drop.input) drop.input.cursor = "pointer";
    const lootTexture = reward.itemId.startsWith("bird.") ? "item.rawBirdMeat"
      : reward.itemId.includes("turtle") || reward.itemId.startsWith("reptile.") ? "item.rawReptileMeat"
        : reward.itemId.startsWith("amphibian.") ? "item.rawAmphibianMeat"
          : reward.itemId.startsWith("crustacean.") ? "item.rawCrustacean"
            : "item.rawGameMeat";
    const meat = this.add.image(0, 0, lootTexture).setDisplaySize(46, 46);
    const label = this.add.text(0, -24, `${itemDisplayName(reward.itemId, language)} ×${reward.quantity}`, { fontFamily: GAME_FONT, fontSize: "10px", color: "#f2e3ad", backgroundColor: "#0b1512dd", padding: { x: 5, y: 2 } }).setOrigin(0.5, 1);
    drop.add([meat, label]);
    drop.once("pointerdown", (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      const loot = { drop, meat, objectId, reward };
      const distance = Phaser.Math.Distance.Between(this.target.x, this.target.y, drop.x, drop.y);
      if (distance <= 54) this.playLootPickup(loot);
      else {
        this.pendingLoot = loot;
        const angle = Phaser.Math.Angle.Between(drop.x, drop.y, this.target.x, this.target.y);
        this.walkTo(drop.x + Math.cos(angle) * 38, drop.y + Math.sin(angle) * 38);
      }
    });
    this.worldObjects.push(drop);
  }

  private playLootPickup(loot: NonNullable<MosswardScene["pendingLoot"]>) {
    if (!this.player || !this.playerSprite || !loot.drop.active) return;
    const female = this.sideWalkTexture === "player.female.walk";
    const animation = female ? "wanderer.female.pickup" : "wanderer.pickup";
    const texture = female ? "player.female.pickup" : "player.pickup";
    const toward = Math.sign(loot.drop.x - this.player.x) || 1;
    this.gatherUntil = this.time.now + 1100;
    this.heldItemHiddenUntil = this.gatherUntil;
    this.playerSprite.stop().setTexture(texture).setScale(female ? 0.17 : 0.16).setOrigin(0.5, 1).setFlipX(toward < 0).setPosition(0, 0).setRotation(0).play(animation);
    this.time.delayedCall(500, () => {
      if (!loot.meat.active || !this.player) return;
      this.tweens.add({ targets: loot.meat, x: this.player.x - loot.drop.x + toward * 15, y: this.player.y - loot.drop.y - 35, scale: 0.35, alpha: 0, duration: 360, ease: "Quad.InOut" });
    });
    this.time.delayedCall(980, () => {
      if (!loot.drop.active || !this.playerSprite) return;
      window.dispatchEvent(new CustomEvent("eldoria:loot", { detail: { objectId: loot.objectId, reward: loot.reward } }));
      loot.drop.destroy();
      this.playerSprite.stop().setTexture(this.sideWalkTexture).setScale(female ? 0.14 : 0.16).setOrigin(0.5, 1).setFrame(0).setPosition(0, 0).setRotation(0);
    });
  }

  /** What came out of a gathered resource, named and floating off its source. */
  private showLoot(objectId: string, reward: { itemId: string; quantity: number }) {
    const source = this.animals.get(objectId)?.container ?? this.resourceHighlights.find((candidate) => candidate.id === objectId);
    if (!source) return;
    const language = this.game.canvas.parentElement?.dataset.language === "ko" ? "ko" : "en";
    const label = this.add.text(source.x, source.y - 46, `+${itemDisplayName(reward.itemId, language)} ×${reward.quantity}`, {
      fontFamily: GAME_FONT,
      fontSize: "13px",
      color: "#f2e3ad",
      backgroundColor: "#0b1512cc",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(13);
    this.tweens.add({ targets: label, y: label.y - 34, alpha: 0, duration: 1500, delay: 320, ease: "Sine.In", onComplete: () => label.destroy() });
  }

  /** A bare-handed strike: the wanderer lunges, the animal takes the hit, and its health bar answers. */
  private resolveStrike(objectId: string, success: boolean, target: { health: number; maximumHealth: number; defeated: boolean }) {
    const animal = this.animals.get(objectId);
    if (!animal || !this.player) return;
    if (this.engagedTarget !== objectId) this.playStrikeMotion(animal.container.x);

    const remaining = Phaser.Math.Clamp(target.health / target.maximumHealth, 0, 1);
    animal.frame.setVisible(!target.defeated);
    animal.fill.setVisible(!target.defeated);
    this.tweens.add({ targets: animal.fill, scaleX: remaining, duration: 220, ease: "Quad.Out" });
    animal.fill.setFillStyle(remaining > 0.5 ? 0xb8523f : remaining > 0.25 ? 0xc47a3a : 0xd4483a);

    if (!success) {
      this.playCombatSound("miss");
      // A miss: the animal breaks away rather than absorbing anything.
      this.tweens.add({ targets: animal.sprite, x: Math.sign(animal.container.x - this.player.x) * 7, duration: 110, yoyo: true, repeat: 1, ease: "Sine.InOut", onComplete: () => animal.sprite.setX(0) });
      return;
    }

    this.playCombatSound("hit");
    if (animal.profile.aggressive && !target.defeated) {
      this.provokedPredators.add(objectId);
      this.tweens.killTweensOf(animal.container);
    }

    const knock = Math.sign(animal.container.x - this.player.x) || 1;
    animal.sprite.setTint(0xffd9c9);
    this.time.delayedCall(90, () => animal.sprite.clearTint());
    this.tweens.add({ targets: animal.sprite, x: knock * 11, duration: 90, yoyo: true, ease: "Quad.Out", onComplete: () => animal.sprite.setX(0) });
    for (let index = 0; index < 5; index += 1) {
      const spark = this.add.circle(animal.container.x, animal.container.y - 10, Phaser.Math.Between(2, 3), 0xd9b06a, 0.9).setDepth(11);
      this.tweens.add({
        targets: spark,
        x: spark.x + knock * Phaser.Math.Between(10, 34),
        y: spark.y - Phaser.Math.Between(4, 26),
        alpha: 0,
        duration: Phaser.Math.Between(240, 420),
        ease: "Quad.Out",
        onComplete: () => spark.destroy(),
      });
    }
    if (!target.defeated) return;
    this.provokedPredators.delete(objectId);
    this.disengage();
    this.tweens.add({
      targets: animal.container,
      alpha: 0,
      angle: knock * 22,
      duration: 520,
      ease: "Quad.In",
      onComplete: () => {
        animal.container.setVisible(false).setAlpha(1).setAngle(0);
        animal.frame.setVisible(false);
        animal.fill.setVisible(false).setScale(1, 1);
        // Firestore combat is resolved locally and therefore has no world-object respawn event.
        // Restore the visual on the same lifecycle as the locally reset health value.
        if (!this.localAuthority) return;
        this.time.delayedCall(LOCAL_WILDLIFE_RESPAWN_MS, () => {
          if (!animal.container.active) return;
          animal.container.setVisible(true).setAlpha(0).setAngle(0);
          animal.sprite.clearTint();
          this.tweens.add({ targets: animal.container, alpha: 1, duration: 650, ease: "Sine.Out" });
        });
      },
    });
  }

  /** The quarry visibly answers: a short committed lunge, claw arc, hit stop, damage number and recoil. */
  private playAnimalCounterattack(objectId: string, damage: number, playerDefeated: boolean) {
    const animal = this.animals.get(objectId);
    if (!animal || !this.player || !this.playerSprite || !animal.container.visible) return;
    const startX = animal.container.x;
    const startY = animal.container.y;
    const angle = Phaser.Math.Angle.Between(startX, startY, this.player.x, this.player.y);
    const lunge = animal.profile.key === "bear" || animal.profile.key === "bison" ? 34 : animal.profile.key === "turkey" ? 30 : 24;
    this.playAnimalAlert(animal.members, animal.profile);
    if (animal.profile.key === "turkey") {
      animal.members.forEach((member, index) => this.tweens.add({ targets: member, angle: index % 2 === 0 ? 13 : -13, y: member.y - 7, duration: 70, delay: index * 16, yoyo: true, repeat: 2, ease: "Sine.InOut" }));
    }
    this.tweens.add({
      targets: animal.container,
      x: startX + Math.cos(angle) * lunge,
      y: startY + Math.sin(angle) * lunge * VERTICAL_FORESHORTENING,
      duration: 120,
      hold: 70,
      yoyo: true,
      ease: "Quad.In",
      onYoyo: () => {
        if (!this.player || !this.playerSprite) return;
        this.playCombatSound("hurt");
        this.playerSprite.setTint(0xff7a68);
        this.time.delayedCall(140, () => this.playerSprite?.clearTint());
        this.cameras.main.shake(animal.profile.key === "bear" || animal.profile.key === "bison" ? 190 : 120, playerDefeated ? 0.012 : 0.006);
        const impactColor = animal.profile.key === "turkey" ? 0xe2b85f : animal.profile.key === "bear" ? 0xb9684e : 0xd89272;
        const impact = this.add.ellipse(this.player.x, this.player.y - 30, 18, 10, impactColor, 0.16).setStrokeStyle(2, impactColor, 0.9).setDepth(14);
        this.tweens.add({ targets: impact, alpha: 0, scaleX: 1.8, scaleY: 1.8, duration: 230, ease: "Quad.Out", onComplete: () => impact.destroy() });
        for (let sparkIndex = 0; sparkIndex < 5; sparkIndex += 1) {
          const spark = this.add.circle(this.player.x, this.player.y - 30, 1.5, impactColor, 0.9).setDepth(14);
          const sparkAngle = angle + Math.PI + Phaser.Math.FloatBetween(-0.9, 0.9);
          this.tweens.add({ targets: spark, x: spark.x + Math.cos(sparkAngle) * Phaser.Math.Between(10, 24), y: spark.y + Math.sin(sparkAngle) * Phaser.Math.Between(6, 18), alpha: 0, duration: Phaser.Math.Between(180, 320), ease: "Quad.Out", onComplete: () => spark.destroy() });
        }
        const damageLabel = this.add.text(this.player.x, this.player.y - 74, `-${damage}`, { fontFamily: GAME_FONT, fontSize: "18px", color: "#ff8a72", stroke: "#30110d", strokeThickness: 3 }).setOrigin(0.5).setDepth(15);
        this.tweens.add({ targets: damageLabel, y: damageLabel.y - 30, alpha: 0, duration: 760, ease: "Quad.Out", onComplete: () => damageLabel.destroy() });
        this.tweens.add({ targets: this.player, x: this.player.x - Math.cos(angle) * 7, y: this.player.y - Math.sin(angle) * 4, duration: 80, yoyo: true, ease: "Quad.Out" });
        if (animal.profile.key === "turkey") {
          for (let index = 0; index < 6; index += 1) {
            const feather = this.add.ellipse(animal.container.x, animal.container.y - 18, 6, 2, 0xb98652, 0.9).setDepth(14).setRotation(Phaser.Math.FloatBetween(-1, 1));
            this.tweens.add({ targets: feather, x: feather.x + Phaser.Math.Between(-28, 28), y: feather.y - Phaser.Math.Between(8, 30), angle: Phaser.Math.Between(-100, 100), alpha: 0, duration: Phaser.Math.Between(320, 540), ease: "Quad.Out", onComplete: () => feather.destroy() });
          }
        }
        if (playerDefeated) this.cameras.main.flash(260, 96, 18, 12, false);
      },
      onComplete: () => animal.container.setPosition(startX, startY),
    });
  }

  /** The arm swings on the sheet's own poses; the body only adds the weight behind it. */
  private playStrikeMotion(targetX: number) {
    const sprite = this.playerSprite;
    if (!sprite || !this.player) return;
    this.playCombatSound("swing");
    this.gatherUntil = this.time.now + 420;
    this.tweens.killTweensOf(sprite);
    const toward = Math.sign(targetX - this.player.x) || 1;
    const female = this.sideWalkTexture === "player.female.walk";
    sprite.stop().setTexture(this.sideWalkTexture).setScale(female ? 0.14 : 0.16).setFlipX(toward < 0);
    this.restingScale = sprite.scaleY;
    this.activeWalkAnimation = this.sideWalkAnimation;
    sprite.play(this.strikeAnimation);
    // Barely any body travel: a lunge of any size reads as a shoulder charge rather than a punch.
    // The weight is carried by a short shift of the hips and the arm pose doing the reaching.
    this.tweens.chain({
      targets: sprite,
      tweens: [
        { x: toward * 4, rotation: toward * 0.05, duration: 90, ease: "Quad.Out" },
        { x: 0, rotation: 0, duration: 220, ease: "Sine.Out" },
      ],
    });
    this.showFistArc(toward);
  }

  /** Short synthesized cues keep combat responsive without shipping one repeated sampled hit. */
  private playCombatSound(kind: "swing" | "hit" | "hurt" | "miss") {
    try {
      this.combatAudio ??= new AudioContext();
      const context = this.combatAudio;
      if (context.state === "suspended") void context.resume();
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(kind === "hurt" ? 0.14 : 0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (kind === "hit" || kind === "hurt" ? 0.16 : 0.11));
      gain.connect(context.destination);
      const oscillator = context.createOscillator();
      oscillator.type = kind === "swing" || kind === "miss" ? "sawtooth" : "triangle";
      const from = kind === "swing" ? 260 : kind === "miss" ? 180 : kind === "hurt" ? 105 : 145;
      const to = kind === "swing" ? 72 : kind === "miss" ? 115 : kind === "hurt" ? 48 : 62;
      oscillator.frequency.setValueAtTime(from, now);
      oscillator.frequency.exponentialRampToValueAtTime(to, now + 0.12);
      oscillator.connect(gain);
      oscillator.start(now);
      oscillator.stop(now + 0.17);
      if (kind === "hit" || kind === "hurt") {
        const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.08), context.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let index = 0; index < channel.length; index += 1) channel[index] = (Math.random() * 2 - 1) * (1 - index / channel.length);
        const noise = context.createBufferSource();
        noise.buffer = buffer;
        noise.connect(gain);
        noise.start(now);
      }
    } catch {
      // Audio can be unavailable in a muted or policy-restricted browser; combat must still continue.
    }
  }

  /** A short arc where the fist travels, so the blow lands somewhere the eye can follow. */
  private showFistArc(toward: number) {
    if (!this.player) return;
    const originX = this.player.x + toward * 12;
    const originY = this.player.y - 30;
    const arc = this.add.graphics().setDepth(11);
    arc.lineStyle(2, 0xf0e2b4, 0.75);
    arc.beginPath();
    arc.arc(originX, originY, 20, toward > 0 ? -0.9 : Math.PI + 0.9, toward > 0 ? 0.5 : Math.PI - 0.5, toward < 0);
    arc.strokePath();
    this.tweens.add({ targets: arc, alpha: 0, duration: 220, delay: 60, ease: "Quad.In", onComplete: () => arc.destroy() });
    const fist = this.add.circle(originX + toward * 14, originY + 4, 3.5, 0xf0e2b4, 0.9).setDepth(11);
    this.tweens.add({ targets: fist, x: fist.x + toward * 12, alpha: 0, duration: 200, delay: 60, ease: "Quad.Out", onComplete: () => fist.destroy() });
  }

  /**
   * Reaching for something on the ground, staged from the walk sheet's own poses: the arm-out frame is
   * held while the body sinks and rises. Easing is slow in and slow out so it reads as bending down
   * rather than snapping between two positions.
   */
  private playGatherMotion(objectId: string, success: boolean) {
    const sprite = this.playerSprite;
    const resource = this.resourceHighlights.find((candidate) => candidate.id === objectId);
    if (!sprite || !this.player || this.moving) return;
    const objectType = getZoneDefinition(this.zoneId)?.layers.objects.find((candidate) => candidate.id === objectId)?.type;
    if (objectType === "wildFruitTree") {
      this.playFruitGatherMotion(resource, success);
      return;
    }
    this.gatherUntil = this.time.now + 900;
    this.tweens.killTweensOf(sprite);
    const female = this.sideWalkTexture === "player.female.walk";
    const reach = SIDE_WALK_SHEETS[this.sideWalkTexture as keyof typeof SIDE_WALK_SHEETS].strike.extend;
    const toward = resource ? Math.sign(resource.x - this.player.x) || 1 : 1;
    sprite.stop().setTexture(this.sideWalkTexture).setScale(female ? 0.14 : 0.16).setFlipX(toward < 0).setFrame(reach);
    this.restingScale = sprite.scaleY;

    const sink = this.restingScale * 0.84;
    this.tweens.chain({
      targets: sprite,
      tweens: [
        { y: 9, x: toward * 3, scaleY: sink, rotation: toward * 0.1, duration: 340, ease: "Sine.InOut" },
        { y: 11, duration: 150, ease: "Sine.InOut" },
        { y: 0, x: 0, scaleY: this.restingScale, rotation: 0, duration: 380, ease: "Sine.InOut" },
      ],
    });
    if (!success || !resource) return;
    const entity = this.resources.get(objectId);
    if (entity) {
      const homeX = entity.container.x;
      entity.sprite.setTint(0xf3dfa0);
      this.tweens.add({
        targets: entity.container,
        x: homeX + (toward > 0 ? 4 : -4),
        angle: toward * 1.4,
        duration: 85,
        yoyo: true,
        repeat: 2,
        ease: "Sine.InOut",
        onComplete: () => {
          entity.container.setX(homeX).setAngle(0);
          entity.sprite.clearTint();
        },
      });
      for (let index = 0; index < 4; index += 1) {
        const chip = this.add.circle(resource.x, resource.y - Phaser.Math.Between(10, 42), Phaser.Math.Between(2, 4), objectId.includes("timber") ? 0x9b7145 : 0xb7aa78, 0.9).setDepth(13);
        this.tweens.add({ targets: chip, x: chip.x + Phaser.Math.Between(-22, 22), y: chip.y + Phaser.Math.Between(8, 28), alpha: 0, duration: Phaser.Math.Between(320, 520), ease: "Quad.Out", onComplete: () => chip.destroy() });
      }
    }
    // The take lands at the bottom of the reach, not at the start of it.
    this.time.delayedCall(430, () => {
      if (!this.player) return;
      const pickup = this.add.circle(resource.x, resource.y - 6, 3.5, 0xe6d3a2, 0.95).setDepth(11);
      this.tweens.add({
        targets: pickup,
        x: this.player.x,
        y: this.player.y - 26,
        scale: 0.35,
        alpha: 0.05,
        duration: 380,
        ease: "Quad.InOut",
        onComplete: () => pickup.destroy(),
      });
    });
  }

  /** Fruit is taken at shoulder height; ground-pickup crouching made the hand reach into empty grass. */
  private playFruitGatherMotion(resource: (typeof this.resourceHighlights)[number] | undefined, success: boolean) {
    if (!resource || !this.player || !this.playerSprite) return;
    const sprite = this.playerSprite;
    const female = this.sideWalkTexture === "player.female.walk";
    const toward = Math.sign(resource.x - this.player.x) || 1;
    const reach = SIDE_WALK_SHEETS[this.sideWalkTexture as keyof typeof SIDE_WALK_SHEETS].strike.extend;
    this.gatherUntil = this.time.now + 900;
    this.heldItemHiddenUntil = this.gatherUntil;
    sprite.stop().setTexture(this.sideWalkTexture).setScale(female ? 0.14 : 0.16).setFlipX(toward < 0).setFrame(reach).setPosition(0, 0).setRotation(0);
    this.tweens.chain({
      targets: sprite,
      tweens: [
        { x: toward * 4, y: -3, rotation: toward * -0.045, duration: 280, ease: "Sine.Out" },
        { x: toward * 5, y: -4, duration: 180 },
        { x: 0, y: 0, rotation: 0, duration: 380, ease: "Sine.InOut" },
      ],
    });
    if (!success) return;
    const fruit = this.add.circle(resource.x, resource.y - 68, 5, 0xb94835, 1).setStrokeStyle(1, 0xe0a45d, 0.9).setDepth(13);
    this.time.delayedCall(300, () => {
      if (!fruit.active || !this.player) return;
      this.tweens.add({ targets: fruit, x: this.player.x + toward * 17, y: this.player.y - 42, scale: 0.55, duration: 330, ease: "Quad.InOut", onComplete: () => fruit.destroy() });
    });
  }

  /** Casts a visible line into the same pond object that the server resolves. */
  private playFishingCast(objectId: string, success: boolean) {
    const water = this.resourceHighlights.find((candidate) => candidate.id === objectId);
    if (!water || !this.player || !this.playerSprite || this.moving) return;
    this.gatherUntil = this.time.now + 1350;
    const toward = Math.sign(water.x - this.player.x) || 1;
    const castX = Phaser.Math.Linear(this.player.x, water.x, 0.58);
    const castY = Phaser.Math.Linear(this.player.y - 28, water.y, 0.72);
    this.playerSprite.stop().setFlipX(toward < 0);

    const line = this.add.graphics().setDepth(11);
    line.lineStyle(1.4, 0xe7dfbd, 0.9);
    line.beginPath();
    line.moveTo(this.player.x + toward * 13, this.player.y - 42);
    line.lineTo(castX, castY);
    line.strokePath();
    const float = this.add.circle(castX, castY, 3.2, 0xd8bd5d, 1).setStrokeStyle(1, 0x362a16, 0.9).setDepth(12);
    const ripple = this.add.ellipse(castX, castY + 2, 12, 5, 0x9dd8c8, 0).setStrokeStyle(1.2, 0xb9e5d5, 0.75).setDepth(10);
    this.tweens.add({ targets: float, y: castY + (success ? 5 : 2), duration: 190, yoyo: true, repeat: success ? 2 : 1, ease: "Sine.InOut" });
    this.tweens.add({ targets: ripple, scaleX: success ? 2.8 : 1.8, scaleY: success ? 2.2 : 1.5, alpha: 0, duration: 900, ease: "Quad.Out" });
    this.time.delayedCall(1050, () => {
      line.destroy();
      float.destroy();
      ripple.destroy();
    });
  }

  private animateWalk(direction: { x: number; y: number }, renderedDistance: number) {
    if (!this.player || !this.playerSprite) return;
    this.moving = Math.hypot(direction.x, direction.y) > 0.05;
    // A swing or a stoop owns the sprite until it finishes. Walk handling runs every frame and would
    // otherwise reset the texture, frame and transform out from under the animation mid-punch.
    if (this.time.now < this.gatherUntil) return;
    const nextAnimation = Math.abs(direction.y) > Math.abs(direction.x) ? direction.y < 0 ? this.northWalkAnimation : this.southWalkAnimation : this.sideWalkAnimation;
    if (Math.abs(direction.x) > 0.08 && nextAnimation === this.sideWalkAnimation) this.playerSprite.setFlipX(direction.x < 0);
    if (!this.moving) {
      const idleFrame = this.activeWalkAnimation === this.southWalkAnimation ? 8 : 0;
      this.walkPhase = 0;
      this.playerSprite.stop().setFrame(idleFrame).setPosition(0, 0).setRotation(0);
      return;
    }

    if (this.activeWalkAnimation !== nextAnimation) {
      this.activeWalkAnimation = nextAnimation;
      const vertical = nextAnimation !== this.sideWalkAnimation;
      const female = this.sideWalkTexture === "player.female.walk";
      this.playerSprite.stop().setTexture(vertical ? this.verticalWalkTexture : this.sideWalkTexture).setScale(vertical ? 0.212 : female ? 0.14 : 0.16).setFlipX(false);
      this.restingScale = this.playerSprite.scaleY;
    }
    // Drive the gait from distance travelled, not a timer. Feet now slow down with the body near a
    // destination and advance by the same amount on high-refresh and low-refresh displays.
    this.walkPhase = (this.walkPhase + renderedDistance / WALK_STRIDE_DISTANCE * Math.PI * 2) % (Math.PI * 2);
    const cycleFrame = Math.floor(this.walkPhase / (Math.PI * 2) * 8) % 8;
    const frameIndex = nextAnimation === this.southWalkAnimation ? cycleFrame + 8 : cycleFrame;
    this.playerSprite.stop().setFrame(frameIndex);
    const footfall = Math.abs(Math.sin(this.walkPhase));
    const sideCenters = nextAnimation === this.sideWalkAnimation ? SIDE_BODY_CENTERS[this.sideWalkTexture] : undefined;
    const bodyCenter = sideCenters?.[cycleFrame] ?? 0.5;
    const bodyOffsetX = (0.5 - bodyCenter) * this.playerSprite.frame.width * this.playerSprite.scaleX;
    this.playerSprite.setX(bodyOffsetX).setY(-footfall * 1.15).setRotation(nextAnimation === this.sideWalkAnimation ? Math.sin(this.walkPhase) * 0.006 : 0);
    if (this.time.now - this.lastDustAt > 180) {
      this.lastDustAt = this.time.now;
      const dust = this.add.circle(this.player.x - direction.x * 12, this.player.y + 1, 3, 0xcbb57a, 0.34).setDepth(8);
      this.tweens.add({ targets: dust, alpha: 0, scale: 2.2, y: dust.y - 4, duration: 360, onComplete: () => dust.destroy() });
    }
  }
}
