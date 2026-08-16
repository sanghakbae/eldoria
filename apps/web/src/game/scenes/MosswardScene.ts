import Phaser from "phaser";
import { getZoneDefinition, isPositionWalkable, worldDefinition } from "@eldoria/game-data";
import { getAssetEntries } from "../assetRegistry";

const WORLD_WIDTH = 1672;
const WORLD_HEIGHT = 941;
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
  private destinationMarker?: Phaser.GameObjects.Arc;
  private moving = false;
  private activeWalkAnimation = "wanderer.walk.side";
  private sideWalkTexture = "player.walk";
  private verticalWalkTexture = "player.walk.vertical";
  private sideWalkAnimation = "wanderer.walk.side";
  private northWalkAnimation = "wanderer.walk.north";
  private southWalkAnimation = "wanderer.walk.south";
  private lastDustAt = 0;
  private cameraZoomFactor = 1;
  private running = false;
  private worldObjects: Phaser.GameObjects.GameObject[] = [];
  private pendingInteraction?: { id: string; x: number; y: number };
  private resourceHighlights: Array<{ id: string; x: number; y: number; outline?: Phaser.GameObjects.Image }> = [];

  constructor() {
    super("mossward");
  }

  preload() {
    for (const [assetId, path] of getAssetEntries()) this.load.image(assetId, path);
    this.load.spritesheet("player.walk", "/assets/characters/primordial-walk.png", { frameWidth: 271, frameHeight: 724, endFrame: 7 });
    this.load.spritesheet("player.walk.vertical", "/assets/characters/primordial-walk-vertical.png", { frameWidth: 221, frameHeight: 443, endFrame: 15 });
    this.load.spritesheet("player.female.walk", "/assets/characters/primordial-female-walk.png", { frameWidth: 262, frameHeight: 749, endFrame: 7 });
    this.load.spritesheet("player.female.walk.vertical", "/assets/characters/primordial-female-walk-vertical.png", { frameWidth: 221, frameHeight: 443, endFrame: 15 });
    this.load.spritesheet("wildlife", "/assets/characters/wildlife-atlas.png", { frameWidth: 512, frameHeight: 1024, endFrame: 2 });
  }

  create() {
    this.running = true;
    const female = this.game.canvas.parentElement?.dataset.gender === "female";
    this.sideWalkTexture = female ? "player.female.walk" : "player.walk";
    this.verticalWalkTexture = female ? "player.female.walk.vertical" : "player.walk.vertical";
    this.sideWalkAnimation = female ? "wanderer.female.walk.side" : "wanderer.walk.side";
    this.northWalkAnimation = female ? "wanderer.female.walk.north" : "wanderer.walk.north";
    this.southWalkAnimation = female ? "wanderer.female.walk.south" : "wanderer.walk.south";
    this.activeWalkAnimation = this.sideWalkAnimation;
    this.background = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, "world.untamedWilds").setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT);
    this.createCollisionTileLayer("untamedWilds");
    this.playerShadow = this.add.ellipse(0, 1, 22, 7, 0x020604, 0.68);
    this.playerSprite = this.add.sprite(0, 0, this.sideWalkTexture, 0).setScale(female ? 0.14 : 0.16).setOrigin(0.5, 0.74);
    this.anims.create({ key: this.sideWalkAnimation, frames: this.anims.generateFrameNumbers(this.sideWalkTexture, { start: 0, end: 7 }), frameRate: 7, repeat: -1 });
    this.anims.create({ key: this.northWalkAnimation, frames: this.anims.generateFrameNumbers(this.verticalWalkTexture, { start: 0, end: 7 }), frameRate: 7, repeat: -1 });
    this.anims.create({ key: this.southWalkAnimation, frames: this.anims.generateFrameNumbers(this.verticalWalkTexture, { start: 8, end: 15 }), frameRate: 7, repeat: -1 });
    this.playerMarker = this.add.triangle(0, -92, 0, 0, 11, 0, 5.5, 8, 0xf4df82, 1).setOrigin(0.5);
    this.player = this.add.container(this.target.x, this.target.y, [this.playerShadow, this.playerSprite, this.playerMarker]).setDepth(10);
    this.tweens.add({ targets: this.playerMarker, y: -98, alpha: 0.62, duration: 650, yoyo: true, repeat: -1, ease: "Sine.InOut" });

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
      this.clickTarget = new Phaser.Math.Vector2(
        Phaser.Math.Clamp(point.x, 30, WORLD_WIDTH - 30),
        Phaser.Math.Clamp(point.y, 45, WORLD_HEIGHT - 25),
      );
      this.pendingInteraction = undefined;
      this.destinationMarker?.setPosition(this.clickTarget.x, this.clickTarget.y).setVisible(true);
    });
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      const zoomStep = deltaY < 0 ? 1.12 : 1 / 1.12;
      this.cameraZoomFactor = Phaser.Math.Clamp(this.cameraZoomFactor * zoomStep, 1, 2.5);
      this.layoutCamera();
    });
    window.addEventListener("eldoria:player-state", this.receivePlayerState);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.running = false;
      window.removeEventListener("eldoria:player-state", this.receivePlayerState);
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
      this.pendingInteraction = undefined;
      this.destinationMarker?.setVisible(false);
    }
    if (this.pendingInteraction && Phaser.Math.Distance.Between(this.target.x, this.target.y, this.pendingInteraction.x, this.pendingInteraction.y) <= 250) {
      window.dispatchEvent(new CustomEvent("eldoria:interact", { detail: { objectId: this.pendingInteraction.id } }));
      this.pendingInteraction = undefined;
      this.clickTarget = undefined;
      this.destinationMarker?.setVisible(false);
    }
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
      if (distance <= 10) {
        this.clickTarget = undefined;
        this.destinationMarker?.setVisible(false);
      } else {
        direction = { x: deltaX / distance, y: deltaY / distance };
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

  private createWorldObjects(zoneId: string) {
    for (const object of this.worldObjects) object.destroy();
    this.worldObjects = [];
    this.resourceHighlights = [];
    const zone = getZoneDefinition(zoneId);
    if (!zone) return;
    for (const object of zone.layers.objects) {
      if (object.type.startsWith("wildlifeSpawn")) {
        const frame = object.type.endsWith("Rabbit") ? 0 : object.type.endsWith("Deer") ? 1 : 2;
        const scale = frame === 0 ? 0.085 : frame === 1 ? 0.11 : 0.1;
        const animalSprite = this.add.sprite(0, 0, "wildlife", frame).setScale(scale).setOrigin(0.5, 0.82);
        const animal = this.add.container(object.x, object.y, [animalSprite]).setDepth(7);
        animalSprite.setInteractive({ useHandCursor: true }).on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          pointer.event.stopPropagation();
          this.requestInteraction(object.id, animal.x, animal.y);
        });
        this.scheduleAnimalMovement(animal, animalSprite, frame, object.x, object.y, zoneId, { facing: Phaser.Math.Between(0, 1) === 0 ? -1 : 1, stepsRemaining: Phaser.Math.Between(6, 12) });
        this.worldObjects.push(animal);
        continue;
      }
      const interactiveTypes = ["fishingWater", "wildTree", "wildFruitTree", "animalDenEntrance", "animalDenExit"];
      if (!interactiveTypes.includes(object.type)) continue;
      const dimensions = object.type === "fishingWater" ? [150, 82] : object.type === "wildTree" ? [92, 132] : object.type === "wildFruitTree" ? [105, 125] : [120, 72];
      const hitArea = this.add.ellipse(object.x, object.y, dimensions[0], dimensions[1], 0x000000, 0.001).setDepth(9).setInteractive({ useHandCursor: true });
      hitArea.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation();
        this.requestInteraction(object.id, object.x, object.y);
      });
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

  private scheduleAnimalMovement(animal: Phaser.GameObjects.Container, sprite: Phaser.GameObjects.Sprite, species: number, homeX: number, homeY: number, zoneId: string, state: { facing: -1 | 1; stepsRemaining: number }) {
    const changingDirection = state.stepsRemaining <= 0;
    if (changingDirection) {
      const farFromHome = Math.abs(animal.x - homeX) > 220;
      if (farFromHome) state.facing = animal.x > homeX ? -1 : 1;
      else if (Phaser.Math.Between(0, 3) === 0) state.facing = state.facing === 1 ? -1 : 1;
      state.stepsRemaining = Phaser.Math.Between(6, 12);
      sprite.setFlipX(state.facing < 0);
    }
    const pause = changingDirection
      ? species === 0 ? Phaser.Math.Between(1200, 2300) : species === 1 ? Phaser.Math.Between(2800, 5200) : Phaser.Math.Between(1900, 3600)
      : species === 0 ? Phaser.Math.Between(100, 350) : species === 1 ? Phaser.Math.Between(420, 950) : Phaser.Math.Between(260, 700);
    this.time.delayedCall(pause, () => {
      if (!animal.active || this.zoneId !== zoneId) return;
      const strideDistance = species === 0 ? Phaser.Math.Between(42, 68) : species === 1 ? Phaser.Math.Between(55, 82) : Phaser.Math.Between(48, 72);
      const targetX = Phaser.Math.Clamp(animal.x + state.facing * strideDistance, 40, WORLD_WIDTH - 40);
      const targetY = Phaser.Math.Clamp(animal.y + Phaser.Math.FloatBetween(-10, 10), 55, WORLD_HEIGHT - 35);
      if (!isPositionWalkable(zoneId, targetX, targetY)) {
        state.stepsRemaining = 0;
        this.scheduleAnimalMovement(animal, sprite, species, homeX, homeY, zoneId, state);
        return;
      }
      const distance = Phaser.Math.Distance.Between(animal.x, animal.y, targetX, targetY);
      const speed = species === 0 ? 72 : species === 1 ? 31 : 42;
      const duration = Math.max(550, distance / speed * 1000);
      sprite.setFlipX(state.facing < 0);
      this.tweens.add({
        targets: animal,
        x: targetX,
        y: targetY,
        duration,
        ease: species === 0 ? "Sine.InOut" : "Linear",
        onUpdate: (tween) => {
          const strides = species === 0 ? 2 : Math.max(2, Math.round(distance / (species === 1 ? 32 : 24)));
          const lift = species === 0 ? 13 : species === 1 ? 3 : 4;
          sprite.y = -Math.abs(Math.sin(tween.progress * Math.PI * strides)) * lift;
          sprite.setRotation(Math.sin(tween.progress * Math.PI * strides * 2) * (species === 0 ? 0.018 : 0.008));
        },
        onComplete: () => {
          sprite.setPosition(0, 0).setRotation(0);
          state.stepsRemaining -= 1;
          this.scheduleAnimalMovement(animal, sprite, species, homeX, homeY, zoneId, state);
        },
      });
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

  private animateWalk(direction: { x: number; y: number }) {
    if (!this.player || !this.playerSprite || !this.playerShadow) return;
    this.moving = Math.hypot(direction.x, direction.y) > 0.05;
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
