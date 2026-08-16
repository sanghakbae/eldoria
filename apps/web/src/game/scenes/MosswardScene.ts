import Phaser from "phaser";
import { findTool, getZoneDefinition, isPositionWalkable, worldDefinition } from "@eldoria/game-data";
import { getAssetEntries } from "../assetRegistry";
import { CharacterRig, type LayerSheet } from "../characterRig";
import { equipmentLayerSheets } from "../equipmentLayers";
import { itemDisplayName } from "../itemNames";

const WORLD_WIDTH = 1672;
const WORLD_HEIGHT = 941;
// How far an animal will drift from where it was placed before it turns back.
const ANIMAL_HOME_RANGE = 260;
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
const WILDLIFE_ATLAS = "wildlife";
const ANIMAL_SPECIES = [
  { key: "rabbit", rect: { x: 60, y: 606, width: 254, height: 288 }, scale: 0.085 },
  { key: "deer", rect: { x: 430, y: 30, width: 492, height: 882 }, scale: 0.11 },
  { key: "boar", rect: { x: 982, y: 424, width: 538, height: 494 }, scale: 0.1 },
] as const;
const ANIMAL_LABELS = [
  { en: "Rabbit", ko: "토끼" },
  { en: "Deer", ko: "사슴" },
  { en: "Wild boar", ko: "멧돼지" },
];
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
const HELD_ITEM_ART: Record<string, { key: string; path: string; height: number; grip: [number, number] }> = {
  "tool.hand-axe": { key: "item.stone-axe.v4", path: "/assets/items/stone-axe.svg?v=4", height: 25, grip: [0.23, 0.84] },
  "tool.pickaxe": { key: "item.stone-pickaxe.v3", path: "/assets/items/stone-pickaxe.svg?v=3", height: 29, grip: [0.2, 0.86] },
  "tool.stone-spear": { key: "item.stone-spear", path: "/assets/items/stone-spear.svg", height: 42, grip: [0.5, 0.34] },
  "tool.fishing-rod": { key: "item.fishing-rod", path: "/assets/items/fishing-rod.svg", height: 34, grip: [0.22, 0.9] },
};
/** Canvas text is drawn outside the CSS cascade, so the family has to be named here as well. */
const GAME_FONT = '"KoPubWorld Dotum", sans-serif';
/** Most nodes are painted into the terrain and have no sprite to trace, so hovering draws the exact
 * region that responds to a click and names what is there. */
/**
 * Click and hover regions in zone pixels. An object's coordinate is where it meets the ground, so
 * `offsetY` lifts the region onto the mass the art draws — centring on the anchor put the outline in
 * the dirt below the rock.
 */
const OBJECT_REGIONS: Record<string, { width: number; height: number; offsetY: number }> = {
  fishingWater: { width: 150, height: 78, offsetY: 0 },
  wildTree: { width: 84, height: 118, offsetY: -62 },
  wildFruitTree: { width: 104, height: 116, offsetY: -60 },
  looseStone: { width: 42, height: 26, offsetY: -9 },
  fallenBranch: { width: 56, height: 22, offsetY: -7 },
  copperOreDeposit: { width: 104, height: 96, offsetY: -50 },
  coalDeposit: { width: 104, height: 96, offsetY: -50 },
  ironOreDeposit: { width: 104, height: 96, offsetY: -50 },
  animalDenEntrance: { width: 116, height: 78, offsetY: -34 },
  animalDenExit: { width: 116, height: 78, offsetY: -34 },
};
const DEFAULT_REGION = { width: 96, height: 72, offsetY: -30 };

const OBJECT_NAMES: Record<string, { en: string; ko: string }> = {
  fishingWater: { en: "Pond — needs a fishing rod", ko: "연못 — 낚싯대 필요" },
  wildTree: { en: "Tree — needs a hand axe", ko: "나무 — 손도끼 필요" },
  wildFruitTree: { en: "Fruit tree", ko: "과수" },
  looseStone: { en: "Loose stone", ko: "돌덩이" },
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
  private playerShadow?: Phaser.GameObjects.Ellipse;
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
  private cameraZoomFactor = 1;
  private running = false;
  private worldObjects: Phaser.GameObjects.GameObject[] = [];
  private pendingInteraction?: { id: string; x: number; y: number };
  private resourceHighlights: Array<{ id: string; x: number; y: number; outline?: Phaser.GameObjects.Image }> = [];
  private gatherUntil = 0;
  private engagedTarget?: string;
  private selectionRing?: Phaser.GameObjects.Ellipse;
  private engagedMark?: Phaser.GameObjects.Container;
  private weaponBadge?: Phaser.GameObjects.Container;
  private rig?: CharacterRig;
  private heldItem?: Phaser.GameObjects.Image;
  private heldItemId = "";
  private riggedEquipment = "";
  private nextStrikeAt = 0;
  private nextRepathAt = 0;
  private lastAnimalClick = { id: "", at: 0 };
  private hoverOutline?: Phaser.GameObjects.Ellipse;
  private hoverLabel?: Phaser.GameObjects.Text;
  private restingScale = 0.16;
  private animals = new Map<string, { container: Phaser.GameObjects.Container; sprite: Phaser.GameObjects.Sprite; fill: Phaser.GameObjects.Rectangle; frame: Phaser.GameObjects.Rectangle; species: number }>();
  private readonly receiveWorldAction = (event: Event) => {
    const detail = (event as CustomEvent<{ objectId: string; actionId: string; success: boolean; target: { health: number; maximumHealth: number; defeated: boolean } | null; reward: { itemId: string; quantity: number } | null }>).detail;
    if (!detail) return;
    if (detail.target) this.resolveStrike(detail.objectId, detail.success, detail.target);
    else if (detail.actionId === "fishing.cast") this.playFishingCast(detail.objectId, detail.success);
    else this.playGatherMotion(detail.objectId, detail.success);
    if (detail.reward) this.showLoot(detail.objectId, detail.reward);
  };

  constructor() {
    super("mossward");
  }

  preload() {
    for (const [assetId, path] of getAssetEntries()) this.load.image(assetId, path);
    this.load.image("player.walk", "/assets/characters/primordial-walk.png");
    this.load.image("player.female.walk", "/assets/characters/primordial-female-walk.png");
    this.load.spritesheet("player.walk.vertical", "/assets/characters/primordial-walk-vertical.png", { frameWidth: 221, frameHeight: 443, endFrame: 15 });
    this.load.spritesheet("player.female.walk.vertical", "/assets/characters/primordial-female-walk-vertical.png", { frameWidth: 221, frameHeight: 443, endFrame: 15 });
    this.load.image(WILDLIFE_ATLAS, "/assets/characters/wildlife-atlas.png");
    for (const art of Object.values(HELD_ITEM_ART)) this.load.image(art.key, art.path);
  }

  create() {
    this.running = true;
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
    this.background = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, "world.untamedWilds").setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT);
    this.createCollisionTileLayer("untamedWilds");
    this.playerShadow = this.add.ellipse(0, 1, 22, 7, 0x020604, 0.68);
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
    this.playerMarker = this.add.triangle(0, -124, 0, 0, 11, 0, 5.5, 8, 0xf4df82, 1).setOrigin(0.5);
    // What the wanderer is fighting with, raised over their head only while a fight is on.
    this.weaponBadge = this.createFistBadge().setVisible(false);
    this.player = this.add.container(this.target.x, this.target.y, [this.playerShadow, this.playerSprite, this.playerMarker, this.weaponBadge]).setDepth(10);
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
    this.createWorldObjects("untamedWilds");
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      if (!pointer.leftButtonDown() || currentlyOver.length > 0) return;
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.pendingInteraction = undefined;
      this.disengage();
      this.walkTo(point.x, point.y);
    });
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      const zoomStep = deltaY < 0 ? 1.12 : 1 / 1.12;
      this.cameraZoomFactor = Phaser.Math.Clamp(this.cameraZoomFactor * zoomStep, 1, 2.5);
      this.layoutCamera();
    });
    window.addEventListener("eldoria:player-state", this.receivePlayerState);
    window.addEventListener("eldoria:world-action", this.receiveWorldAction);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.running = false;
      window.removeEventListener("eldoria:player-state", this.receivePlayerState);
      window.removeEventListener("eldoria:world-action", this.receiveWorldAction);
      this.background = undefined;
      this.collisionLayer = undefined;
    });
  }

  update() {
    if (!this.player || !this.keys) return;
    this.player.x = Phaser.Math.Linear(this.player.x, this.target.x, 0.28);
    this.player.y = Phaser.Math.Linear(this.player.y, this.target.y, 0.28);

    const x = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    const y = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown);
    const keyboardMagnitude = Math.hypot(x, y);
    if (keyboardMagnitude > 0) {
      this.clickTarget = undefined;
      this.pathQueue = [];
      this.pendingInteraction = undefined;
      this.disengage();
      this.destinationMarker?.setVisible(false);
    }
    if (this.pendingInteraction && Phaser.Math.Distance.Between(this.target.x, this.target.y, this.pendingInteraction.x, this.pendingInteraction.y) <= 250) {
      window.dispatchEvent(new CustomEvent("eldoria:interact", { detail: { objectId: this.pendingInteraction.id } }));
      this.pendingInteraction = undefined;
      this.clickTarget = undefined;
      this.pathQueue = [];
      this.destinationMarker?.setVisible(false);
    }
    this.syncEquipmentLayers();
    this.syncHeldItem();
    if (this.rig && this.playerSprite) {
      const frameName = this.playerSprite.frame.name;
      this.rig.followBody(this.playerSprite, Number.parseInt(frameName, 10) || 0);
    }
    this.pursueEngagedAnimal();
    let nearest: (typeof this.resourceHighlights)[number] | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const resource of this.resourceHighlights) {
      const distance = Phaser.Math.Distance.Between(this.target.x, this.target.y, resource.x, resource.y);
      resource.outline?.setVisible(distance <= 300);
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
        this.clickTarget = this.pathQueue.shift();
        if (!this.clickTarget) this.destinationMarker?.setVisible(false);
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
    this.animateWalk(direction);
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
        this.createCollisionTileLayer(position.zoneId);
        this.createWorldObjects(position.zoneId);
        this.cameras.main.fadeIn(220, 4, 10, 7);
      }
      if (this.player) this.player.setPosition(position.x, position.y);
    }
    this.target.set(position.x, position.y);
  };

  private layoutCamera() {
    const fitZoom = Math.max(this.scale.width / WORLD_WIDTH, this.scale.height / WORLD_HEIGHT, 0.72);
    const zoom = fitZoom * this.cameraZoomFactor;
    this.cameras.main.setZoom(zoom);
  }

  /** One reusable outline and label, moved to whatever the cursor is over. */
  private showHover(x: number, y: number, width: number, height: number, name?: { en: string; ko: string }) {
    const korean = this.game.canvas.parentElement?.dataset.language === "ko";
    this.hoverOutline ??= this.add.ellipse(0, 0, 10, 10, 0xf1dc77, 0.07).setStrokeStyle(2, 0xf1dc77, 0.9).setDepth(11);
    this.hoverLabel ??= this.add.text(0, 0, "", {
      fontFamily: GAME_FONT,
      fontSize: "12px",
      color: "#f2e3ad",
      backgroundColor: "#0b1512e0",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 1).setDepth(12);
    this.hoverOutline.setPosition(x, y).setSize(width, height).setDisplaySize(width, height).setVisible(true);
    this.hoverLabel.setPosition(x, y - height / 2 - 6).setText(name ? (korean ? name.ko : name.en) : "").setVisible(Boolean(name));
  }

  private hideHover() {
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
    const texture = this.textures.get(WILDLIFE_ATLAS);
    for (const species of ANIMAL_SPECIES) {
      if (texture.has(species.key)) continue;
      texture.add(species.key, 0, species.rect.x, species.rect.y, species.rect.width, species.rect.height);
    }
  }

  private createWorldObjects(zoneId: string) {
    for (const object of this.worldObjects) object.destroy();
    this.worldObjects = [];
    this.resourceHighlights = [];
    this.animals.clear();
    this.hideHover();
    const zone = getZoneDefinition(zoneId);
    if (!zone) return;
    for (const object of zone.layers.objects) {
      if (object.type.startsWith("wildlifeSpawn")) {
        const frame = object.type.endsWith("Rabbit") ? 0 : object.type.endsWith("Deer") ? 1 : 2;
        const species = ANIMAL_SPECIES[frame]!;
        const { scale, rect } = species;
        // Drawn whole. Two attempts at faking a gait by cropping the pose into body and legs — sliding
        // the band, then pivoting it at the hip — both tore the animal apart on screen. A single still
        // pose can carry weight through bob and lean, but it cannot be made to articulate.
        const animalSprite = this.add.sprite(0, 0, WILDLIFE_ATLAS, species.key).setScale(scale).setOrigin(0.5, ANIMAL_ORIGIN_Y);
        const barY = -ANIMAL_ORIGIN_Y * rect.height * scale - 9;
        const barFrame = this.add.rectangle(0, barY, HEALTH_BAR_WIDTH, 5, 0x0b1512, 0.9).setStrokeStyle(1, 0x000000, 0.7).setVisible(false);
        const barFill = this.add.rectangle(-HEALTH_BAR_WIDTH / 2 + 1, barY, HEALTH_BAR_WIDTH - 2, 3, 0xb8523f).setOrigin(0, 0.5).setVisible(false);
        const animal = this.add.container(object.x, object.y, [animalSprite, barFrame, barFill]).setDepth(7);
        this.animals.set(object.id, { container: animal, sprite: animalSprite, fill: barFill, frame: barFrame, species: frame });
        const speciesName = ANIMAL_LABELS[frame]!;
        animalSprite.on("pointerover", () => this.showHover(animal.x, animal.y - rect.height * scale * 0.45, rect.width * scale * 0.9, rect.height * scale, speciesName));
        animalSprite.on("pointerout", () => this.hideHover());
        animalSprite.setInteractive({ useHandCursor: true }).on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          pointer.event.stopPropagation();
          // Ultima Online's convention: one click picks the quarry out, two sets you on it.
          const doubleClicked = this.lastAnimalClick.id === object.id && this.time.now - this.lastAnimalClick.at < DOUBLE_CLICK_MS;
          this.lastAnimalClick = { id: object.id, at: this.time.now };
          if (doubleClicked) this.engageAnimal(object.id);
          else this.markAnimal(object.id);
        });
        this.scheduleAnimalMovement(animal, animalSprite, frame, object.x, object.y, zoneId, { heading: Phaser.Math.FloatBetween(0, Math.PI * 2), stepsRemaining: Phaser.Math.Between(3, 7) }, object.id);
        this.worldObjects.push(animal);
        continue;
      }
      const interactiveTypes = ["fishingWater", "wildTree", "wildFruitTree", "animalDenEntrance", "animalDenExit", "copperOreDeposit", "coalDeposit", "ironOreDeposit", "looseStone", "fallenBranch"];
      if (!interactiveTypes.includes(object.type)) continue;
      // These sit on painted terrain with no sprite of their own, so the click target has to be
      // generous enough to hit the rock or trunk the art actually shows.
      const region = OBJECT_REGIONS[object.type] ?? DEFAULT_REGION;
      const regionY = object.y + region.offsetY;
      const hitArea = this.add.ellipse(object.x, regionY, region.width, region.height, 0x000000, 0.001).setDepth(9).setInteractive({ useHandCursor: true });
      hitArea.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation();
        this.requestInteraction(object.id, object.x, object.y);
      });
      // The hover outline is the hit area itself, so what lights up is exactly what responds to a click.
      hitArea.on("pointerover", () => this.showHover(object.x, regionY, region.width, region.height, OBJECT_NAMES[object.type]));
      hitArea.on("pointerout", () => this.hideHover());
      this.worldObjects.push(hitArea);

      let outline: Phaser.GameObjects.Image | undefined;
      if (object.type === "wildFruitTree") {
        outline = this.add.image(object.x, object.y, "resource.wildFruitTree").setOrigin(0.5, 1).setTint(0xeadb78).setScale(1.07).setDepth(8).setVisible(false);
        const fruitTree = this.add.image(object.x, object.y, "resource.wildFruitTree").setOrigin(0.5, 1).setDepth(9);
        this.worldObjects.push(outline, fruitTree);
      }
      this.resourceHighlights.push({ id: object.id, x: object.x, y: object.y, outline });
    }
  }

  /** A single click only rings the animal, so a misclick does not start a hunt. */
  private markAnimal(objectId: string) {
    const animal = this.animals.get(objectId);
    if (!animal) return;
    this.selectionRing ??= this.add.ellipse(0, 0, 42, 20, 0xf1dc77, 0).setStrokeStyle(2, 0xf1dc77, 0.85).setDepth(6);
    this.selectionRing.setPosition(animal.container.x, animal.container.y).setVisible(true);
  }

  /** Double-clicking sets the hunt: the wanderer closes the distance and keeps swinging. */
  private engageAnimal(objectId: string) {
    const animal = this.animals.get(objectId);
    if (!animal) return;
    this.tweens.killTweensOf(animal.container);
    this.engagedTarget = objectId;
    this.nextStrikeAt = 0;
    this.nextRepathAt = 0;
    this.pendingInteraction = undefined;
    this.selectionRing ??= this.add.ellipse(0, 0, 42, 20, 0xf1dc77, 0).setStrokeStyle(2, 0xf1dc77, 0.85).setDepth(6);
    this.selectionRing.setVisible(true);
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
    const art = HELD_ITEM_ART[equipped];
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
    const equipped = this.game.canvas.parentElement?.dataset.equipped ?? "";
    const art = HELD_ITEM_ART[equipped];
    if (!art || !this.textures.exists(art.key)) {
      this.heldItem.setVisible(false);
      this.heldItemId = "";
      return;
    }
    if (this.heldItemId !== equipped) {
      this.heldItemId = equipped;
      this.heldItem.setTexture(art.key);
    }
    // The grip is what rides the hand anchor, so it becomes the sprite's own origin. Apply this on
    // every sync: hot reloads can update art calibration while the equipped item id stays unchanged.
    this.heldItem.setOrigin(art.grip[0], art.grip[1]);
    const source = this.textures.get(art.key).getSourceImage();
    this.heldItem.setDisplaySize((art.height * source.width) / source.height, art.height);
    const frameIndex = Number.parseInt(sprite.frame.name, 10) || 0;
    const vertical = sprite.texture.key === this.verticalWalkTexture;
    const anchors = vertical ? VERTICAL_HAND_ANCHORS : HAND_ANCHORS[this.sideWalkTexture];
    const pose = anchors?.[frameIndex % anchors.length] ?? anchors?.[0];
    if (!pose) {
      this.heldItem.setVisible(false);
      return;
    }
    const bodySide = sprite.flipX ? -1 : 1;
    const itemFlipped = vertical ? frameIndex >= 8 : sprite.flipX;
    const rotationSide = itemFlipped ? -1 : 1;
    const width = sprite.frame.width * sprite.scaleX;
    const height = sprite.frame.height * sprite.scaleY;
    this.heldItem
      .setPosition(sprite.x + bodySide * (pose.fx - 0.5) * width, sprite.y + (pose.fy - 1) * height)
      .setFlipX(itemFlipped)
      .setRotation(sprite.rotation + rotationSide * pose.angle)
      .setVisible(true);
    // Seen from behind, the hand and torso occlude the grip. From the front the tool stays visible.
    if (vertical && frameIndex < 8) this.player?.moveBelow(this.heldItem, sprite);
    else this.player?.moveAbove(this.heldItem, sprite);
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
    this.selectionRing?.setVisible(false);
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
    const destination = new Phaser.Math.Vector2(
      Phaser.Math.Clamp(x, 30, zone.width - 30),
      Phaser.Math.Clamp(y, 45, zone.height - 25),
    );
    this.pathQueue = this.findPath(this.target, destination, zone);
    this.clickTarget = this.pathQueue.shift() ?? destination;
    this.destinationMarker?.setPosition(destination.x, destination.y).setVisible(true);
  }

  private findPath(from: Phaser.Math.Vector2, to: Phaser.Math.Vector2, zone: NonNullable<ReturnType<typeof getZoneDefinition>>): Phaser.Math.Vector2[] {
    const { tileSize, columns, rows } = zone;
    const toTile = (point: Phaser.Math.Vector2) => ({ tx: Phaser.Math.Clamp(Math.floor(point.x / tileSize), 0, columns - 1), ty: Phaser.Math.Clamp(Math.floor(point.y / tileSize), 0, rows - 1) });
    const centre = (tx: number, ty: number) => new Phaser.Math.Vector2(tx * tileSize + tileSize / 2, ty * tileSize + tileSize / 2);
    const open = (tx: number, ty: number) => isPositionWalkable(this.zoneId, tx * tileSize + tileSize / 2, ty * tileSize + tileSize / 2);
    const start = toTile(from);
    const goal = toTile(to);
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
      if (!isPositionWalkable(this.zoneId, from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio)) return false;
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
    this.selectionRing?.setPosition(animal.container.x, animal.container.y).setVisible(true);
    const markHeight = ANIMAL_SPECIES[animal.species]!.rect.height * ANIMAL_SPECIES[animal.species]!.scale;
    this.engagedMark?.setPosition(animal.container.x, animal.container.y - markHeight - 14).setVisible(true);
    const reach = Phaser.Math.Distance.Between(this.target.x, this.target.y, animal.container.x, animal.container.y);
    const closing = this.clickTarget !== undefined;
    if (reach > (closing ? STRIKE_REACH : STRIKE_BREAK_OFF)) {
      // The quarry keeps moving, so the route is refreshed rather than plotted once and trusted.
      if (this.time.now >= this.nextRepathAt) {
        this.nextRepathAt = this.time.now + 500;
        this.walkTo(animal.container.x, animal.container.y);
      }
      return;
    }
    this.clickTarget = undefined;
    this.pathQueue = [];
    this.destinationMarker?.setVisible(false);
    if (this.time.now < this.nextStrikeAt) return;
    this.nextStrikeAt = this.time.now + STRIKE_INTERVAL_MS;
    // Swing on the attempt, not on the reply. The server may refuse the blow outright — a stag will
    // not be taken bare-handed — and the wanderer should still be seen throwing the punch.
    this.playStrikeMotion(animal.container.x);
    window.dispatchEvent(new CustomEvent("eldoria:interact", { detail: { objectId: this.engagedTarget } }));
  }

  private requestInteraction(id: string, x: number, y: number) {
    const distance = Phaser.Math.Distance.Between(this.target.x, this.target.y, x, y);
    if (distance <= 250) {
      window.dispatchEvent(new CustomEvent("eldoria:interact", { detail: { objectId: id } }));
      return;
    }
    const angle = Phaser.Math.Angle.Between(x, y, this.target.x, this.target.y);
    const approachDistance = id.includes("animal-den") ? 235 : 190;
    const approach = new Phaser.Math.Vector2(x + Math.cos(angle) * approachDistance, y + Math.sin(angle) * approachDistance);
    this.pendingInteraction = { id, x, y };
    this.clickTarget = approach;
    this.destinationMarker?.setVisible(false);
  }

  /**
   * Animals hold a heading and adjust it by small turns rather than snapping between left and right,
   * so a wander reads as browsing ground rather than pacing a line. Every animal in the atlas is drawn
   * facing left, so a rightward heading is the one that needs flipping.
   */
  private scheduleAnimalMovement(animal: Phaser.GameObjects.Container, sprite: Phaser.GameObjects.Sprite, species: number, homeX: number, homeY: number, zoneId: string, state: { heading: number; stepsRemaining: number }, objectId: string) {
    const resting = state.stepsRemaining <= 0;
    if (resting) {
      const towardHome = Phaser.Math.Angle.Between(animal.x, animal.y, homeX, homeY);
      const strayed = Phaser.Math.Distance.Between(animal.x, animal.y, homeX, homeY) > ANIMAL_HOME_RANGE;
      state.heading = strayed
        ? towardHome + Phaser.Math.FloatBetween(-0.5, 0.5)
        : state.heading + Phaser.Math.FloatBetween(-1.5, 1.5);
      state.stepsRemaining = Phaser.Math.Between(3, 7);
    }
    // A rest is a graze; the steps between are the quick shuffles of an animal working over ground.
    const pause = resting
      ? species === 0 ? Phaser.Math.Between(1400, 3200) : species === 1 ? Phaser.Math.Between(3200, 6500) : Phaser.Math.Between(2200, 4600)
      : species === 0 ? Phaser.Math.Between(120, 420) : species === 1 ? Phaser.Math.Between(450, 1100) : Phaser.Math.Between(280, 820);
    this.time.delayedCall(pause, () => {
      if (!animal.active || this.zoneId !== zoneId) return;
      // An animal in a fight stands its ground and turns to face the wanderer instead of browsing off.
      if (this.engagedTarget === objectId) {
        if (this.player) sprite.setFlipX(this.player.x > animal.x);
        this.time.delayedCall(240, () => this.scheduleAnimalMovement(animal, sprite, species, homeX, homeY, zoneId, state, objectId));
        return;
      }
      if (resting) this.grazeInPlace(sprite, species);
      const stride = species === 0 ? Phaser.Math.Between(38, 66) : species === 1 ? Phaser.Math.Between(52, 84) : Phaser.Math.Between(45, 74);
      // The camera looks down at a slant, so a step north covers less screen than a step east.
      const targetX = Phaser.Math.Clamp(animal.x + Math.cos(state.heading) * stride, 40, WORLD_WIDTH - 40);
      const targetY = Phaser.Math.Clamp(animal.y + Math.sin(state.heading) * stride * VERTICAL_FORESHORTENING, 55, WORLD_HEIGHT - 35);
      if (!isPositionWalkable(zoneId, targetX, targetY)) {
        // Turn away from the obstruction instead of stopping dead against it.
        state.heading += Phaser.Math.FloatBetween(1.8, 2.6) * (Phaser.Math.Between(0, 1) === 0 ? -1 : 1);
        state.stepsRemaining -= 1;
        this.scheduleAnimalMovement(animal, sprite, species, homeX, homeY, zoneId, state, objectId);
        return;
      }
      const distance = Phaser.Math.Distance.Between(animal.x, animal.y, targetX, targetY);
      const speed = species === 0 ? 72 : species === 1 ? 31 : 42;
      const duration = Math.max(550, distance / speed * 1000);
      const facingRight = Math.cos(state.heading) > 0;
      const parts = this.animals.get(objectId);
      if (Math.abs(Math.cos(state.heading)) > 0.2) sprite.setFlipX(facingRight);
      this.tweens.add({
        targets: animal,
        x: targetX,
        y: targetY,
        duration,
        ease: "Sine.InOut",
        onUpdate: (tween) => {
          const strides = species === 0 ? 2 : Math.max(2, Math.round(distance / (species === 1 ? 32 : 24)));
          const phase = tween.progress * Math.PI * strides;
          const lift = species === 0 ? 13 : species === 1 ? 3 : 4;
          const bob = -Math.abs(Math.sin(phase)) * lift;
          const tilt = Math.sin(phase * 2) * (species === 0 ? 0.018 : 0.008);
          sprite.y = bob;
          sprite.setRotation(tilt);
        },
        onComplete: () => {
          sprite.setPosition(0, 0).setRotation(0);
          animal.setDepth(7 + animal.y / WORLD_HEIGHT);
          state.stepsRemaining -= 1;
          this.scheduleAnimalMovement(animal, sprite, species, homeX, homeY, zoneId, state, objectId);
        },
      });
    });
  }

  /** A head-down dip during a rest, so a stopped animal is not a frozen one. */
  private grazeInPlace(sprite: Phaser.GameObjects.Sprite, species: number) {
    const dip = species === 1 ? 4 : 3;
    this.tweens.add({
      targets: sprite,
      y: dip,
      rotation: (sprite.flipX ? -1 : 1) * 0.05,
      duration: species === 0 ? 320 : 620,
      yoyo: true,
      repeat: species === 0 ? 1 : 2,
      ease: "Sine.InOut",
      onComplete: () => sprite.setPosition(0, 0).setRotation(0),
    });
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

  /** What came out of the kill or the gather, named and floating off the thing it came from. */
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
      // A miss: the animal breaks away rather than absorbing anything.
      this.tweens.add({ targets: animal.sprite, x: Math.sign(animal.container.x - this.player.x) * 7, duration: 110, yoyo: true, repeat: 1, ease: "Sine.InOut", onComplete: () => animal.sprite.setX(0) });
      return;
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
    this.tweens.add({
      targets: animal.container,
      alpha: 0,
      angle: knock * 22,
      y: animal.container.y + 6,
      duration: 520,
      ease: "Quad.In",
      onComplete: () => animal.container.setVisible(false),
    });
  }

  /** The arm swings on the sheet's own poses; the body only adds the weight behind it. */
  private playStrikeMotion(targetX: number) {
    const sprite = this.playerSprite;
    if (!sprite || !this.player) return;
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
    this.tweens.add({ targets: this.playerShadow, scaleX: 1.16, scaleY: 0.82, duration: 340, yoyo: true, hold: 150, ease: "Sine.InOut" });
    if (!success || !resource) return;
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

  private animateWalk(direction: { x: number; y: number }) {
    if (!this.player || !this.playerSprite || !this.playerShadow) return;
    this.moving = Math.hypot(direction.x, direction.y) > 0.05;
    // A swing or a stoop owns the sprite until it finishes. Walk handling runs every frame and would
    // otherwise reset the texture, frame and transform out from under the animation mid-punch.
    if (this.time.now < this.gatherUntil) return;
    const nextAnimation = Math.abs(direction.y) > Math.abs(direction.x) ? direction.y < 0 ? this.northWalkAnimation : this.southWalkAnimation : this.sideWalkAnimation;
    if (Math.abs(direction.x) > 0.08 && nextAnimation === this.sideWalkAnimation) this.playerSprite.setFlipX(direction.x < 0);
    if (!this.moving) {
      this.playerSprite.stop().setFrame(0).setPosition(0, 0).setRotation(0);
      this.playerShadow.setScale(1, 1).setAlpha(0.52);
      return;
    }

    if (this.activeWalkAnimation !== nextAnimation) {
      this.activeWalkAnimation = nextAnimation;
      const vertical = nextAnimation !== this.sideWalkAnimation;
      const female = this.sideWalkTexture === "player.female.walk";
      this.playerSprite.stop().setTexture(vertical ? this.verticalWalkTexture : this.sideWalkTexture).setScale(vertical ? 0.212 : female ? 0.14 : 0.16).setFlipX(false);
      this.restingScale = this.playerSprite.scaleY;
    }
    if (!this.playerSprite.anims.isPlaying) this.playerSprite.play(nextAnimation);
    const footfall = Math.abs(Math.sin(this.time.now * 0.016));
    this.playerShadow.setScale(1 - footfall * 0.08, 1 - footfall * 0.05).setAlpha(0.52 - footfall * 0.08);
    if (this.time.now - this.lastDustAt > 180) {
      this.lastDustAt = this.time.now;
      const dust = this.add.circle(this.player.x - direction.x * 12, this.player.y + 22, 3, 0xcbb57a, 0.34).setDepth(8);
      this.tweens.add({ targets: dust, alpha: 0, scale: 2.2, y: dust.y - 4, duration: 360, onComplete: () => dust.destroy() });
    }
  }
}
