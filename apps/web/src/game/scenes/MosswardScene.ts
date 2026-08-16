import Phaser from "phaser";

export class MosswardScene extends Phaser.Scene {
  constructor() {
    super("mossward");
  }

  preload() {
    this.load.image("world.mossward", "/assets/world/mossward-crossing.png");
  }

  create() {
    this.cameras.main.setRoundPixels(true);
    this.add.image(480, 288, "world.mossward").setDisplaySize(960, 576);

    const shade = this.add.graphics();
    shade.fillStyle(0x06130d, 0.12);
    shade.fillRect(0, 0, 960, 576);

    const fireflies: Phaser.GameObjects.Arc[] = [];
    for (let index = 0; index < 22; index += 1) {
      const x = 30 + ((index * 137) % 900);
      const y = 35 + ((index * 83) % 500);
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
}
