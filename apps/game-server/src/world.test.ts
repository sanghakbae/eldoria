import { describe, expect, it } from "vitest";
import { RuntimeWorld } from "./world";

describe("RuntimeWorld", () => {
  it("moves authenticated runtime players at a server-owned speed", () => {
    const world = new RuntimeWorld();
    const player = world.join("user-1");
    world.setDirection("user-1", { x: 1, y: 0 }, 1);
    world.tick(1);
    expect(player.position).toEqual({ zoneId: "untamedWilds", x: 932, y: 470 });
  });

  it("joins at a persisted character checkpoint", () => {
    const world = new RuntimeWorld();
    const player = world.join("user-1", { zoneId: "amberfen", x: 420, y: 610 });
    expect(player.position).toEqual({ zoneId: "amberfen", x: 420, y: 610 });
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

  it("moves an invalid saved checkpoint to the safe arrival spawn", () => {
    const world = new RuntimeWorld();
    const player = world.join("user-1", { zoneId: "mossward", x: 836, y: 555 });
    expect(player.position).toEqual({ zoneId: "untamedWilds", x: 836, y: 470 });
  });
});
