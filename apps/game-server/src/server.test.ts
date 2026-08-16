import { decodeServerMessage, encodeMessage } from "@eldoria/game-protocol";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ServerMessage } from "@eldoria/game-protocol";
import { createGameServer, type RunningGameServer } from "./server";
import { MemoryCharacterRepository } from "./character-repository";

let server: RunningGameServer | undefined;
afterEach(async () => server?.close());

describe("game server", () => {
  it("reports health and completes the websocket handshake", async () => {
    server = await createGameServer(
      { host: "127.0.0.1", port: 0, firebaseProjectId: "test" },
      { verifyIdToken: async () => ({ uid: "test-user" }), characters: new MemoryCharacterRepository() },
    );
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

  it("creates, lists, and selects only an authenticated character", async () => {
    const characters = new MemoryCharacterRepository();
    server = await createGameServer(
      { host: "127.0.0.1", port: 0, firebaseProjectId: "test" },
      { verifyIdToken: async () => ({ uid: "owner-1" }), characters },
    );
    const socket = new WebSocket(server.address.replace("http", "ws"));
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });

    const authenticated = waitForMessage(socket, "auth.success");
    const listed = waitForMessage(socket, "character.list");
    socket.send(encodeMessage({ type: "auth", requestId: "auth-1", payload: { idToken: "valid" } }));
    expect(await authenticated).toMatchObject({ payload: { uid: "owner-1" } });
    expect(await listed).toMatchObject({ payload: { characters: [] } });

    const creation = waitForMessage(socket, "character.created");
    socket.send(encodeMessage({ type: "character.create", requestId: "create-1", payload: { name: "Ari Stone" } }));
    const created = await creation;
    if (created.type !== "character.created") throw new Error("Expected character.created");
    const selection = waitForMessage(socket, "character.selected");
    socket.send(encodeMessage({ type: "character.select", requestId: "select-1", payload: { characterId: created.payload.character.id } }));
    expect(await selection).toMatchObject({ payload: { character: { name: "Ari Stone" } } });
    socket.close();
  });
});

function waitForMessage<T extends ServerMessage["type"]>(socket: WebSocket, type: T): Promise<Extract<ServerMessage, { type: T }>> {
  return new Promise((resolve) => {
    const receive = (data: WebSocket.RawData) => {
      const message = decodeServerMessage(data.toString());
      if (message?.type !== type) return;
      socket.off("message", receive);
      resolve(message as Extract<ServerMessage, { type: T }>);
    };
    socket.on("message", receive);
  });
}
