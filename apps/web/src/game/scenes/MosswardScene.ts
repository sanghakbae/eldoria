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
  private player?: Phaser.GameObjects.Image;
  private keys?: DirectionKeys;
  private target = new Phaser.Math.Vector2(836, 555);
  private background?: Phaser.GameObjects.Image;
  private zoneId = "mossward";
  private previousDirection = "0,0";

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
    this.add.ellipse(this.target.x, this.target.y + 23, 34, 12, 0x020604, 0.42).setDepth(9);
    this.player = this.add.image(this.target.x, this.target.y, "player.wanderer").setDisplaySize(47, 70).setOrigin(0.5, 0.82).setDepth(10);

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT).startFollow(this.player, true, 0.12, 0.12);
    this.layoutCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutCamera, this));

    this.keys = this.input.keyboard?.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as DirectionKeys | undefined;
    window.addEventListener("eldoria:player-state", this.receivePlayerState);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener("eldoria:player-state", this.receivePlayerState));
  }

  update() {
    if (!this.player || !this.keys) return;
    this.player.x = Phaser.Math.Linear(this.player.x, this.target.x, 0.28);
    this.player.y = Phaser.Math.Linear(this.player.y, this.target.y, 0.28);

    const x = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    const y = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown);
    const magnitude = Math.hypot(x, y);
    const direction = magnitude > 0 ? { x: x / magnitude, y: y / magnitude } : { x: 0, y: 0 };
    const signature = `${direction.x},${direction.y}`;
    if (signature !== this.previousDirection) {
      this.previousDirection = signature;
      window.dispatchEvent(new CustomEvent("eldoria:move-intent", { detail: direction }));
    }
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
}
