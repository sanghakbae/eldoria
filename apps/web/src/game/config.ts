import Phaser from "phaser";
import { MosswardScene } from "./scenes/MosswardScene";

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || 960,
    height: parent.clientHeight || 540,
    transparent: false,
    backgroundColor: "#06120e",
    pixelArt: true,
    antialias: false,
    render: {
      clearBeforeRender: true,
      preserveDrawingBuffer: false,
    },
    scene: [MosswardScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };
}
