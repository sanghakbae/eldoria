import Phaser from "phaser";

const WORLD_WIDTH = 1672;
const WORLD_HEIGHT = 941;
const ZONE_ASSETS: Record<string, string> = {
  mossward: "world.mossward",
  greythorn: "world.greythorn",
  amberfen: "world.amberfen",
  hollowVault: "world.hollowVault",
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
  private playerSprite?: Phaser.GameObjects.Image;
  private playerOutline?: Phaser.GameObjects.Image;
  private playerMarker?: Phaser.GameObjects.Triangle;
  private keys?: DirectionKeys;
  private target = new Phaser.Math.Vector2(836, 555);
  private background?: Phaser.GameObjects.Image;
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
    this.load.image("world.mossward", "/assets/world/mossward-crossing.png");
    this.load.image("world.greythorn", "/assets/world/greythorn-wood.png");
    this.load.image("world.amberfen", "/assets/world/amberfen-wilds.png");
    this.load.image("world.hollowVault", "/assets/world/hollow-vault.png");
    this.load.image("player.wanderer", "/assets/characters/wanderer-sprite.png");
  }

  create() {
    this.background = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, "world.mossward").setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT);
    const groundRing = this.add.ellipse(0, 25, 48, 19, 0x15271f, 0.56).setStrokeStyle(2, 0xf0da77, 0.9);
    const shadow = this.add.ellipse(0, 24, 36, 12, 0x020604, 0.5);
    const playerOutline = this.add.image(0, 0, "player.wanderer").setDisplaySize(64, 94).setOrigin(0.5, 0.82).setTint(0xf1d875).setAlpha(0.38);
    this.playerOutline = playerOutline;
    this.playerSprite = this.add.image(0, 0, "player.wanderer").setDisplaySize(58, 87).setOrigin(0.5, 0.82);
    this.playerMarker = this.add.triangle(0, -78, 0, 0, 12, 0, 6, 9, 0xf4df82, 1).setOrigin(0.5);
    this.player = this.add.container(this.target.x, this.target.y, [groundRing, shadow, playerOutline, this.playerSprite, this.playerMarker]).setDepth(10);
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
      const texture = ZONE_ASSETS[position.zoneId];
      if (texture) this.background?.setTexture(texture);
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

  private animateWalk(direction: { x: number; y: number }) {
    if (!this.player || !this.playerSprite || !this.playerOutline) return;
    this.moving = Math.hypot(direction.x, direction.y) > 0.05;
    if (Math.abs(direction.x) > 0.08) this.playerSprite.setFlipX(direction.x < 0);
    if (!this.moving) {
      this.playerSprite.y = Phaser.Math.Linear(this.playerSprite.y, 0, 0.3);
      this.playerSprite.rotation = Phaser.Math.Linear(this.playerSprite.rotation, 0, 0.3);
      this.playerOutline.y = Phaser.Math.Linear(this.playerOutline.y, 0, 0.3);
      this.playerOutline.rotation = Phaser.Math.Linear(this.playerOutline.rotation, 0, 0.3);
      return;
    }

    const phase = this.time.now * 0.018;
    this.playerSprite.y = Math.sin(phase) * 2.2;
    this.playerSprite.rotation = Math.sin(phase * 0.5) * 0.025;
    this.playerOutline.y = this.playerSprite.y;
    this.playerOutline.rotation = this.playerSprite.rotation;
    if (this.time.now - this.lastDustAt > 180) {
      this.lastDustAt = this.time.now;
      const dust = this.add.circle(this.player.x - direction.x * 12, this.player.y + 22, 3, 0xcbb57a, 0.34).setDepth(8);
      this.tweens.add({ targets: dust, alpha: 0, scale: 2.2, y: dust.y - 4, duration: 360, onComplete: () => dust.destroy() });
    }
  }
}
