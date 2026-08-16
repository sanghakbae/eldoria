import { describe, expect, it } from "vitest";
import { resolveGameServerUrl } from "./connection";

describe("resolveGameServerUrl", () => {
  it("uses ws for a local http client", () => {
    expect(resolveGameServerUrl({ hostname: "localhost", protocol: "http:" })).toBe("ws://localhost:8787");
  });

  it("uses a configured endpoint verbatim", () => {
    expect(resolveGameServerUrl({ hostname: "ignored", protocol: "https:" }, "wss://realm.example/game")).toBe("wss://realm.example/game");
  });
});
