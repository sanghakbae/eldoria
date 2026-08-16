import Phaser from "phaser";
import { getZoneDefinition, worldDefinition } from "@eldoria/game-data";
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
  private target = new Phaser.Math.Vector2(900, 700);
  private background?: Phaser.GameObjects.Image;
  private collisionLayer?: Phaser.Tilemaps.TilemapLayer;
  private zoneId = "mossward";
  private previousDirection = "0,0";
  private clickTarget?: Phaser.Math.Vector2;
  private destinationMarker?: Phaser.GameObjects.Arc;
  private moving = false;
  private lastDustAt = 0;

  constructor() {
    super("mossward");
  }

  preload() {
    for (const [assetId, path] of getAssetEntries()) this.load.image(assetId, path);
    this.load.spritesheet("player.walk", "/assets/characters/wanderer-walk.png", { frameWidth: 272, frameHeight: 724 });
  }

  create() {
    this.background = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, "world.mossward").setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT);
    this.createCollisionTileLayer("mossward");
    this.playerShadow = this.add.ellipse(0, 1, 30, 9, 0x020604, 0.52);
    this.playerSprite = this.add.sprite(0, 0, "player.walk", 0).setDisplaySize(76, 102).setOrigin(0.5, 0.79);
    this.anims.create({ key: "wanderer.walk", frames: this.anims.generateFrameNumbers("player.walk", { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
    this.playerMarker = this.add.triangle(0, -84, 0, 0, 12, 0, 6, 9, 0xf4df82, 1).setOrigin(0.5);
    this.player = this.add.container(this.target.x, this.target.y, [this.playerShadow, this.playerSprite, this.playerMarker]).setDepth(10);
    this.tweens.add({ targets: this.playerMarker, y: -84, alpha: 0.58, duration: 650, yoyo: true, repeat: -1, ease: "Sine.InOut" });

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT).startFollow(this.player, true, 0.12, 0.12);
    this.layoutCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutCamera, this));

    this.keys = this.input.keyboard?.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as DirectionKeys | undefined;
    this.destinationMarker = this.add.circle(this.target.x, this.target.y, 10, 0xdacb78, 0.22).setStrokeStyle(2, 0xeadf9a, 0.8).setDepth(8).setVisible(false);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.clickTarget = new Phaser.Math.Vector2(
        Phaser.Math.Clamp(point.x, 30, WORLD_WIDTH - 30),
        Phaser.Math.Clamp(point.y, 45, WORLD_HEIGHT - 25),
      );
      this.destinationMarker?.setPosition(this.clickTarget.x, this.clickTarget.y).setVisible(true);
    });
    window.addEventListener("eldoria:player-state", this.receivePlayerState);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener("eldoria:player-state", this.receivePlayerState));
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
      this.destinationMarker?.setVisible(false);
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
    const position = (event as CustomEvent<{ zoneId: string; x: number; y: number }>).detail;
    if (!position) return;
    if (position.zoneId !== this.zoneId) {
      this.zoneId = position.zoneId;
      const zone = getZoneDefinition(position.zoneId);
      if (zone) {
        this.background?.setTexture(zone.layers.terrain.assetId);
        this.createCollisionTileLayer(position.zoneId);
      }
      if (this.player) this.player.setPosition(position.x, position.y);
    }
    this.target.set(position.x, position.y);
  };

  private layoutCamera() {
    const visibleWorldWidth = 900;
    const visibleWorldHeight = 540;
    const zoom = Math.max(this.scale.width / visibleWorldWidth, this.scale.height / visibleWorldHeight, 1);
    this.cameras.main.setZoom(zoom);
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
    if (Math.abs(direction.x) > 0.08) this.playerSprite.setFlipX(direction.x < 0);
    if (!this.moving) {
      this.playerSprite.stop().setFrame(0).setPosition(0, 0).setRotation(0);
      this.playerShadow.setScale(1, 1).setAlpha(0.52);
      return;
    }

    if (!this.playerSprite.anims.isPlaying) this.playerSprite.play("wanderer.walk");
    const footfall = Math.abs(Math.sin(this.time.now * 0.016));
    this.playerShadow.setScale(1 - footfall * 0.08, 1 - footfall * 0.05).setAlpha(0.52 - footfall * 0.08);
    if (this.time.now - this.lastDustAt > 180) {
      this.lastDustAt = this.time.now;
      const dust = this.add.circle(this.player.x - direction.x * 12, this.player.y + 22, 3, 0xcbb57a, 0.34).setDepth(8);
      this.tweens.add({ targets: dust, alpha: 0, scale: 2.2, y: dust.y - 4, duration: 360, onComplete: () => dust.destroy() });
    }
  }
}
