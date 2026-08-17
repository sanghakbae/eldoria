import { describe, expect, it } from "vitest";
import { RuntimeWorld } from "./world";

describe("RuntimeWorld", () => {
  it("moves authenticated runtime players at a server-owned speed", () => {
    const world = new RuntimeWorld();
    const player = world.join("user-1");
    world.setDirection("user-1", { x: 1, y: 0 }, 1);
    world.tick(1);
    expect(player.position).toEqual({ zoneId: "untamedWilds", x: 888, y: 470 });
  });

  it("moves north through the open wilderness", () => {
    const world = new RuntimeWorld();
    const player = world.join("user-1");
    world.setDirection("user-1", { x: 0, y: -1 }, 1);
    world.tick(1);
    expect(player.position).toEqual({ zoneId: "untamedWilds", x: 836, y: 418 });
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
    player.position = { zoneId: "mossward", x: 350, y: 400 };
    world.setDirection("user-1", { x: 0, y: -1 }, 1);
    world.tick(1);
    expect(player.position.y).toBe(400);
  });

  it("moves an invalid saved checkpoint to the safe arrival spawn", () => {
    const world = new RuntimeWorld();
    const player = world.join("user-1", { zoneId: "mossward", x: 350, y: 400 });
    expect(player.position).toEqual({ zoneId: "untamedWilds", x: 836, y: 470 });
  });

  it("teleports through an interactive den entrance", () => {
    const world = new RuntimeWorld();
    const player = world.join("user-1");
    expect(world.teleport("user-1", "animalDen", "arrival")).toBe(player);
    expect(player.position).toEqual({ zoneId: "animalDen", x: 836, y: 790 });
    world.place("user-1", { zoneId: "untamedWilds", x: 250, y: 290 });
    expect(player.position).toEqual({ zoneId: "untamedWilds", x: 250, y: 290 });
  });

  it("crosses north from the southwest starting region", () => {
    const world = new RuntimeWorld();
    const player = world.join("user-1", { zoneId: "untamedWilds", x: 836, y: 46 });
    world.setDirection("user-1", { x: 0, y: -1 }, 1);
    world.tick(1);
    expect(player.position).toEqual({ zoneId: "sunscar", x: 836, y: 916 });
  });

  it("keeps the southwest starting region closed at the southern world edge", () => {
    const world = new RuntimeWorld();
    const player = world.join("user-1", { zoneId: "untamedWilds", x: 836, y: 915 });
    world.setDirection("user-1", { x: 0, y: 1 }, 1);
    world.tick(1);
    expect(player.position).toEqual({ zoneId: "untamedWilds", x: 836, y: 916 });
  });

  it("crosses east into the neighbouring primordial coast", () => {
    const world = new RuntimeWorld();
    const player = world.join("user-1", { zoneId: "untamedWilds", x: 1641, y: 470 });
    world.setDirection("user-1", { x: 1, y: 0 }, 1);
    world.tick(1);
    expect(player.position).toEqual({ zoneId: "region-10-2", x: 35, y: 470 });
  });
});
