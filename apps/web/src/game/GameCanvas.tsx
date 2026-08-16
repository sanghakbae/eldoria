import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { createGameConfig } from "./config";

export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    const host = hostRef.current;
    gameRef.current = new Phaser.Game(createGameConfig(host));
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry || !gameRef.current) return;
      const width = Math.max(1, Math.round(entry.contentRect.width));
      const height = Math.max(1, Math.round(entry.contentRect.height));
      gameRef.current.scale.resize(width, height);
    });
    resizeObserver.observe(host);

    return () => {
      resizeObserver.disconnect();
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={hostRef} className="game-canvas" />;
}
