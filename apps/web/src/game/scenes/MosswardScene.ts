import Phaser from "phaser";

const TILE = 32;
const COLS = 30;
const ROWS = 18;

export class MosswardScene extends Phaser.Scene {
  constructor() {
    super("mossward");
  }

  create() {
    this.cameras.main.setRoundPixels(true);
    this.drawGround();
    this.drawRoad();
    this.drawWater();
    this.drawBuildings();
    this.drawTrees();
    this.drawLandmarks();
    this.drawAtmosphere();
  }

  private drawGround() {
    const graphics = this.add.graphics();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const noise = (x * 17 + y * 31) % 5;
        graphics.fillStyle([0x315940, 0x355f43, 0x2e553b, 0x3a6346, 0x325b3e][noise] ?? 0x315940);
        graphics.fillRect(x * TILE, y * TILE, TILE, TILE);
        if ((x * 7 + y * 13) % 11 === 0) {
          graphics.fillStyle(0x7b9560, 0.55);
          graphics.fillRect(x * TILE + 7, y * TILE + 11, 2, 4);
          graphics.fillRect(x * TILE + 11, y * TILE + 9, 2, 6);
        }
      }
    }
  }

  private drawRoad() {
    const g = this.add.graphics();
    g.fillStyle(0x766b50);
    g.fillRect(0, 272, 960, 70);
    g.fillRect(432, 0, 76, 576);
    g.fillStyle(0x9a8964, 0.42);
    for (let x = 4; x < 960; x += 38) g.fillRect(x, 286 + ((x / 38) % 2) * 21, 21, 4);
    for (let y = 12; y < 576; y += 35) g.fillRect(452 + ((y / 35) % 2) * 22, y, 20, 4);
  }

  private drawWater() {
    const g = this.add.graphics();
    g.fillStyle(0x1d5660);
    g.fillRect(0, 470, 280, 106);
    g.fillStyle(0x4d8b85, 0.6);
    for (let y = 484; y < 576; y += 17) {
      for (let x = (y % 34); x < 270; x += 54) g.fillRect(x, y, 27, 2);
    }
    g.fillStyle(0xa18b61);
    g.fillRect(205, 463, 26, 113);
    g.fillStyle(0x5f4b37);
    for (let y = 469; y < 576; y += 18) g.fillRect(205, y, 26, 4);
  }

  private drawBuildings() {
    this.building(130, 105, 150, 112, 0x6c4b38, 0xb2683e);
    this.building(610, 100, 168, 122, 0x5b4538, 0x85513b);
    this.building(635, 365, 140, 106, 0x6b503a, 0xa27145);
  }

  private building(x: number, y: number, width: number, height: number, wall: number, roof: number) {
    const g = this.add.graphics();
    g.fillStyle(0x13231d, 0.45); g.fillRect(x + 10, y + 12, width, height);
    g.fillStyle(wall); g.fillRect(x, y + 30, width, height - 30);
    g.fillStyle(roof); g.fillTriangle(x - 10, y + 38, x + width / 2, y, x + width + 10, y + 38);
    g.fillRect(x - 5, y + 28, width + 10, 18);
    g.fillStyle(0x281f1b); g.fillRect(x + width / 2 - 12, y + height - 35, 24, 35);
    g.fillStyle(0xe8bb62, 0.8); g.fillRect(x + 24, y + 61, 18, 17); g.fillRect(x + width - 42, y + 61, 18, 17);
  }

  private drawTrees() {
    const positions = [[40, 55], [80, 155], [335, 68], [845, 72], [885, 165], [330, 415], [845, 420], [925, 505], [335, 520], [52, 390]];
    positions.forEach(([x = 0, y = 0], index) => {
      const g = this.add.graphics();
      g.fillStyle(0x403524); g.fillRect(x - 5, y + 20, 11, 31);
      g.fillStyle(index % 2 ? 0x183c2d : 0x1e4731); g.fillCircle(x, y + 13, 27);
      g.fillStyle(0x376044); g.fillCircle(x - 11, y + 4, 15); g.fillCircle(x + 13, y + 8, 17);
      g.fillStyle(0x799054, 0.6); g.fillCircle(x - 8, y - 3, 4);
    });
  }

  private drawLandmarks() {
    const g = this.add.graphics();
    g.fillStyle(0x24342b); g.fillCircle(470, 305, 38);
    g.fillStyle(0x678462); g.fillCircle(470, 305, 31);
    g.fillStyle(0x8fa77a); g.fillCircle(470, 305, 20);
    g.fillStyle(0x1b3128); g.fillRect(459, 275, 22, 58);
    g.fillStyle(0xc6974b); g.fillCircle(470, 278, 7);

    const player = this.add.graphics();
    player.fillStyle(0x17251f, 0.4); player.fillEllipse(542, 336, 24, 10);
    player.fillStyle(0xc8a16c); player.fillCircle(542, 309, 8);
    player.fillStyle(0x244e67); player.fillRect(534, 318, 16, 22);
    player.fillStyle(0xd2d8c8); player.fillRect(530, 322, 4, 18);
  }

  private drawAtmosphere() {
    const fireflies: Phaser.GameObjects.Arc[] = [];
    for (let i = 0; i < 18; i += 1) {
      const x = 25 + ((i * 137) % 910);
      const y = 30 + ((i * 83) % 510);
      const dot = this.add.circle(x, y, 2, 0xd6da7c, 0.25 + (i % 4) * 0.15);
      fireflies.push(dot);
    }
    fireflies.forEach((dot, index) => {
      this.tweens.add({ targets: dot, alpha: { from: 0.18, to: 0.9 }, y: dot.y - 8, duration: 1200 + index * 90, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    });
  }
}
