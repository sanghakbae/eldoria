import Phaser from "phaser";
import { MosswardScene } from "./scenes/MosswardScene";

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 576;

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#0c1d18",
    pixelArt: true,
    antialias: false,
    scene: [MosswardScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };
}
