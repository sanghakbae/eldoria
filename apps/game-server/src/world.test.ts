import { describe, expect, it } from "vitest";
import { RuntimeWorld } from "./world";

describe("RuntimeWorld", () => {
  it("moves authenticated runtime players at a server-owned speed", () => {
    const world = new RuntimeWorld();
    const player = world.join("user-1");
    world.setDirection("user-1", { x: 1, y: 0 }, 1);
    world.tick(1);
    expect(player.position).toEqual({ zoneId: "mossward", x: 1016, y: 555 });
  });

  it("rejects stale input sequences", () => {
    const world = new RuntimeWorld();
    const player = world.join("user-1");
    world.setDirection("user-1", { x: 1, y: 0 }, 2);
    world.setDirection("user-1", { x: -1, y: 0 }, 1);
    world.tick(1);
    expect(player.position.x).toBeGreaterThan(836);
  });

  it("rejects movement through map obstacles", () => {
    const world = new RuntimeWorld();
    const player = world.join("user-1");
    player.position = { zoneId: "mossward", x: 700, y: 390 };
    world.setDirection("user-1", { x: 0, y: -1 }, 1);
    world.tick(1);
    expect(player.position.y).toBe(390);
  });
});
