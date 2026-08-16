import Phaser from "phaser";

export class MosswardScene extends Phaser.Scene {
  private background?: Phaser.GameObjects.Image;
  private shade?: Phaser.GameObjects.Graphics;

  constructor() {
    super("mossward");
  }

  preload() {
    this.load.image("world.mossward", "/assets/world/mossward-crossing.png");
  }

  create() {
    this.cameras.main.setRoundPixels(true);
    this.background = this.add.image(0, 0, "world.mossward");
    this.shade = this.add.graphics();
    this.layoutWorld();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutWorld, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutWorld, this));

    const fireflies: Phaser.GameObjects.Arc[] = [];
    for (let index = 0; index < 22; index += 1) {
      const x = 30 + ((index * 137) % Math.max(40, this.scale.width - 60));
      const y = 35 + ((index * 83) % Math.max(40, this.scale.height - 70));
      const dot = this.add.circle(x, y, index % 3 === 0 ? 2 : 1, 0xf4d878, 0.2 + (index % 4) * 0.12);
      fireflies.push(dot);
    }
    fireflies.forEach((dot, index) => this.tweens.add({
      targets: dot,
      alpha: { from: 0.12, to: 0.85 },
      x: dot.x + (index % 2 ? 6 : -6),
      y: dot.y - 9,
      duration: 1400 + index * 70,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    }));
  }

  private layoutWorld() {
    if (!this.background || !this.shade) return;
    const width = this.scale.width;
    const height = this.scale.height;
    const sourceWidth = 1672;
    const sourceHeight = 941;
    const coverScale = Math.max(width / sourceWidth, height / sourceHeight);
    this.background.setPosition(width / 2, height / 2).setDisplaySize(sourceWidth * coverScale, sourceHeight * coverScale);
    this.shade.clear().fillStyle(0x06130d, 0.12).fillRect(0, 0, width, height);
  }
}
