import { decodeServerMessage, encodeMessage } from "@eldoria/game-protocol";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createGameServer, type RunningGameServer } from "./server";

let server: RunningGameServer | undefined;
afterEach(async () => server?.close());

describe("game server", () => {
  it("reports health and completes the websocket handshake", async () => {
    server = await createGameServer({ host: "127.0.0.1", port: 0 });
    const health = await fetch(`${server.address}/health`);
    expect(await health.json()).toEqual({ status: "ok", service: "eldoria-game-server" });

    const socket = new WebSocket(server.address.replace("http", "ws"));
    const ready = await new Promise<unknown>((resolve, reject) => {
      socket.once("open", () => socket.send(encodeMessage({ type: "connection.hello", requestId: "test-1", payload: { clientVersion: "test" } })));
      socket.once("message", (data) => resolve(decodeServerMessage(data.toString())));
      socket.once("error", reject);
    });
    expect(ready).toMatchObject({ type: "connection.ready", requestId: "test-1" });
    socket.close();
  });
});
