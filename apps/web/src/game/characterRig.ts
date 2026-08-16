import Phaser from "phaser";
import { characterLayerSpec, type EquipmentSlot } from "@eldoria/game-data";

/** A pose sheet: one row of evenly readable poses that all share a baseline. */
export type LayerSheet = {
  textureKey: string;
  /** Measured pose bounds, `[x, width]` per frame. Poses are not assumed to be evenly spaced. */
  poses: ReadonlyArray<readonly [number, number]>;
  /** The single y band every pose shares, so the figure keeps one baseline through the cycle. */
  y: number;
  height: number;
};

/**
 * Draws a character as a stack of layers that move as one: body, worn pieces, held tools. Every layer
 * plays the same frame index of the same cycle, so a sleeve stays on the arm it belongs to and an axe
 * stays in the hand that swings it.
 *
 * Layers whose art has not been produced yet simply do not render. That is the point of the rig: the
 * game runs today with a body alone, and each sheet that arrives lights up its slot with no further
 * code — no shapes drawn on top guessing where a hand might be.
 */
export class CharacterRig {
  private readonly layers = new Map<EquipmentSlot, Phaser.GameObjects.Sprite>();
  private readonly sheets = new Map<EquipmentSlot, LayerSheet>();
  private frame = 0;
  private flipped = false;
  private scaleFactor = 1;

  constructor(private readonly scene: Phaser.Scene, readonly container: Phaser.GameObjects.Container) {}

  /**
   * Registers a sheet for a slot and cuts its frames. Frames are registered from measured bounds
   * rather than an even division: pose sheets in this project have never divided evenly, and slicing
   * them on an assumption is what cut the arms off the figure.
   */
  attach(slot: EquipmentSlot, sheet: LayerSheet, scale: number) {
    const texture = this.scene.textures.get(sheet.textureKey);
    if (!texture) return;
    sheet.poses.forEach(([x, width], index) => {
      const name = `${slot}.${index}`;
      if (!texture.has(name)) texture.add(name, 0, x, sheet.y, width, sheet.height);
    });
    const definition = characterLayerSpec.slots.find((candidate) => candidate.id === slot);
    const sprite = this.scene.add.sprite(0, 0, sheet.textureKey, `${slot}.0`)
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setDepth(definition?.z ?? 0);
    this.detach(slot);
    this.sheets.set(slot, sheet);
    this.layers.set(slot, sprite);
    this.scaleFactor = scale;
    this.container.add(sprite);
    this.restack();
    sprite.setFrame(`${slot}.${this.frame}`);
    sprite.setFlipX(this.flipped);
  }

  detach(slot: EquipmentSlot) {
    const existing = this.layers.get(slot);
    if (!existing) return;
    this.container.remove(existing, true);
    this.layers.delete(slot);
    this.sheets.delete(slot);
  }

  has(slot: EquipmentSlot): boolean {
    return this.layers.has(slot);
  }

  /** Mirrors the body's current pose onto every worn layer, so the stack moves as one figure. */
  followBody(body: Phaser.GameObjects.Sprite, frameIndex: number) {
    this.frame = frameIndex;
    this.flipped = body.flipX;
    for (const [slot, sprite] of this.layers) {
      const sheet = this.sheets.get(slot);
      if (!sheet) continue;
      sprite.setFrame(`${slot}.${frameIndex % sheet.poses.length}`);
      sprite.setFlipX(body.flipX);
      sprite.setPosition(body.x, body.y).setRotation(body.rotation).setScale(body.scaleX, body.scaleY);
    }
  }

  /** Every layer shows the same pose index, which is what keeps the stack in one piece. */
  setFrame(index: number) {
    this.frame = index;
    for (const [slot, sprite] of this.layers) {
      const sheet = this.sheets.get(slot);
      if (!sheet) continue;
      sprite.setFrame(`${slot}.${index % sheet.poses.length}`);
    }
  }

  setFlipX(flipped: boolean) {
    this.flipped = flipped;
    for (const sprite of this.layers.values()) sprite.setFlipX(flipped);
  }

  /** Applied to the whole stack so a worn piece never drifts off the body it is worn on. */
  setPose(offsetX: number, offsetY: number, rotation: number, scaleY = this.scaleFactor) {
    for (const sprite of this.layers.values()) {
      sprite.setPosition(offsetX, offsetY).setRotation(rotation).setScale(this.scaleFactor, scaleY);
    }
  }

  get body(): Phaser.GameObjects.Sprite | undefined {
    return this.layers.get("body");
  }

  private restack() {
    for (const definition of characterLayerSpec.slots) {
      const sprite = this.layers.get(definition.id);
      if (sprite) this.container.bringToTop(sprite);
    }
  }
}
