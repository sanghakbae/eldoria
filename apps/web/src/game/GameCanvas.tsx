import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { BuiltStructure } from "@eldoria/game-protocol";
import { createGameConfig } from "./config";

export function GameCanvas({ gender, language, equipped, equipment, structures }: { gender: "female" | "male"; language: "en" | "ko"; equipped: string | null; equipment: Record<string, string | null | undefined>; structures: BuiltStructure[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    const host = hostRef.current;
    host.dataset.gender = gender;
    gameRef.current = new Phaser.Game(createGameConfig(host));
    // The drawing buffer has to be sized in device pixels. Sized in CSS pixels it was a 1x image
    // stretched over a 2x screen, which is what made the whole world look smeared. The camera derives
    // its zoom from the buffer size, so the world keeps its apparent scale and simply gains detail.
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry || !gameRef.current) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(entry.contentRect.width * ratio));
      const height = Math.max(1, Math.round(entry.contentRect.height * ratio));
      gameRef.current.scale.resize(width, height);
      const canvas = gameRef.current.canvas;
      canvas.style.width = `${Math.round(entry.contentRect.width)}px`;
      canvas.style.height = `${Math.round(entry.contentRect.height)}px`;
      // Phaser's scale manager writes centering margins while the viewport is changing. On a phone
      // rotation those values can be calculated from the previous parent width and survive after our
      // explicit resize, pushing the whole world down and to the right. This host owns the exact size.
      canvas.style.margin = "0";
    });
    resizeObserver.observe(host);

    return () => {
      resizeObserver.disconnect();
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [gender, language]);

  // The scene reads these off the host element. They live in their own effect because the effect that
  // builds the game bails out once it exists, so anything written there stops updating after mount.
  useEffect(() => {
    if (!hostRef.current) return;
    hostRef.current.dataset.language = language;
    hostRef.current.dataset.equipped = equipped ?? "";
    hostRef.current.dataset.equipment = JSON.stringify(Object.fromEntries(Object.entries(equipment).filter(([, itemId]) => Boolean(itemId))));
    hostRef.current.dataset.structures = JSON.stringify(structures);
    window.dispatchEvent(new CustomEvent("eldoria:structures", { detail: structures }));
  }, [language, equipped, equipment, structures]);

  return <div ref={hostRef} className="game-canvas" />;
}
