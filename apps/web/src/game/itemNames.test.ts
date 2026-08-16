import { describe, expect, it } from "vitest";
import { itemDisplayName } from "./itemNames";

describe("itemDisplayName", () => {
  it("labels butchered meat by material and species", () => {
    expect(itemDisplayName("meat.rabbit", "ko")).toBe("육고기(토끼)");
    expect(itemDisplayName("meat.deer", "ko")).toBe("육고기(사슴)");
    expect(itemDisplayName("meat.rabbit", "en")).toBe("Meat (Rabbit)");
  });

  it("keeps bird meat distinct from mammal meat", () => {
    expect(itemDisplayName("bird.turkey", "ko")).toBe("새고기(칠면조)");
  });
});
