import { describe, expect, it } from "vitest";
import { decodeClientMessage, decodeServerMessage, encodeMessage } from "./index";

describe("game protocol", () => {
  it("round-trips a valid client hello", () => {
    const message = { type: "connection.hello", requestId: "abc", payload: { clientVersion: "0.1.0" } } as const;
    expect(decodeClientMessage(encodeMessage(message))).toEqual(message);
  });

  it("rejects malformed and unknown messages", () => {
    expect(decodeClientMessage("not-json")).toBeNull();
    expect(decodeServerMessage(JSON.stringify({ type: "unknown", requestId: "1", payload: {} }))).toBeNull();
  });
});
