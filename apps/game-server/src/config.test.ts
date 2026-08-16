import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("provides safe development defaults", () => {
    expect(loadConfig({})).toEqual({ host: "0.0.0.0", port: 8787, firebaseProjectId: "eldoria-8e943" });
  });

  it("rejects invalid ports", () => {
    expect(() => loadConfig({ PORT: "70000" })).toThrow("Invalid PORT");
  });
});
