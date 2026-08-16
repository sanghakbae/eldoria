import { describe, expect, it } from "vitest";
import { isPositionWalkable } from "./index";

describe("zone collision data", () => {
  it("blocks Mossward buildings while leaving the road open", () => {
    expect(isPositionWalkable("mossward", 700, 200)).toBe(false);
    expect(isPositionWalkable("mossward", 900, 700)).toBe(true);
  });

  it("rejects positions outside known zones", () => {
    expect(isPositionWalkable("unknown", 10, 10)).toBe(false);
    expect(isPositionWalkable("greythorn", -1, 400)).toBe(false);
  });
});
