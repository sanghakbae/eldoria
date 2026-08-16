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
      { verifyIdToken: async () => ({ uid: "test-user", admin: false }), characters: new MemoryCharacterRepository() },
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
      { verifyIdToken: async () => ({ uid: "owner-1", admin: false }), characters },
    );
    const socket = new WebSocket(server.address.replace("http", "ws"));
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });

    const authenticated = waitForMessage(socket, "auth.success");
    const listed = waitForMessage(socket, "character.list");
    socket.send(encodeMessage({ type: "auth", requestId: "auth-1", payload: { idToken: "valid" } }));
    expect(await authenticated).toMatchObject({ payload: { uid: "owner-1" } });
    expect(await listed).toMatchObject({ payload: { characters: [] } });

    const creation = waitForMessage(socket, "character.created");
    socket.send(encodeMessage({ type: "character.create", requestId: "create-1", payload: { name: "Ari Stone", gender: "female" } }));
    const created = await creation;
    if (created.type !== "character.created") throw new Error("Expected character.created");
    const selection = waitForMessage(socket, "character.selected");
    socket.send(encodeMessage({ type: "character.select", requestId: "select-1", payload: { characterId: created.payload.character.id } }));
    expect(await selection).toMatchObject({ payload: { character: { name: "Ari Stone", gender: "female" } } });
    socket.close();
  });

  it("rolls an interaction against the skill curve and records the attempt either way", async () => {
    const characters = new MemoryCharacterRepository();
    server = await createGameServer(
      { host: "127.0.0.1", port: 0, firebaseProjectId: "test" },
      { verifyIdToken: async () => ({ uid: "owner-2", admin: false }), characters },
    );
    const socket = await openSelectedCharacter(server, "Bran Ash");

    const acted = waitForMessage(socket, "world.action");
    socket.send(encodeMessage({ type: "world.interact", requestId: "interact-1", payload: { objectId: "wilds.rabbit-spawn" } }));
    const action = await acted;
    if (action.type !== "world.action") throw new Error("Expected world.action");

    // A rabbit is the one animal bare hands can reliably reach, so its floor lifts it off the curve.
    expect(action.payload.outcome).toMatchObject({ skillId: "hunting", chance: 0.5 });
    expect(action.payload.survival?.skills?.hunting).toMatchObject({ completedActions: 1 });
    if (!action.payload.outcome?.success) expect(action.payload.reward).toBeUndefined();
    socket.close();
  });

  it("persists the skill lock a player sets", async () => {
    server = await createGameServer(
      { host: "127.0.0.1", port: 0, firebaseProjectId: "test" },
      { verifyIdToken: async () => ({ uid: "owner-3", admin: false }), characters: new MemoryCharacterRepository() },
    );
    const socket = await openSelectedCharacter(server, "Ilse Rook");

    const locked = waitForMessage(socket, "skill.locked");
    socket.send(encodeMessage({ type: "skill.lock", requestId: "lock-1", payload: { skillId: "pottery", lock: "down" } }));
    expect(await locked).toMatchObject({ payload: { skillId: "pottery", lock: "down", survival: { locks: { pottery: "down" } } } });

    const rejected = waitForMessage(socket, "error");
    socket.send(encodeMessage({ type: "skill.lock", requestId: "lock-2", payload: { skillId: "sorcery", lock: "down" } }));
    expect(await rejected).toMatchObject({ payload: { code: "skill.not_found" } });
    socket.close();
  });

  it("allows only Firebase administrators to tune skill progression", async () => {
    server = await createGameServer(
      { host: "127.0.0.1", port: 0, firebaseProjectId: "test" },
      { verifyIdToken: async (token) => ({ uid: "admin-1", admin: token === "admin-token" }), characters: new MemoryCharacterRepository() },
    );
    const denied = await fetch(`${server.address}/admin/skill-config`, { headers: { authorization: "Bearer user-token" } });
    expect(denied.status).toBe(403);
    const updated = await fetch(`${server.address}/admin/skill-config`, {
      method: "PUT",
      headers: { authorization: "Bearer admin-token", "content-type": "application/json" },
      body: JSON.stringify({ skillId: "hunting", actionsPerGain: 10, gainAmount: 0.1 }),
    });
    expect(await updated.json()).toMatchObject({ skill: { id: "hunting", actionsPerGain: 10, gainAmount: 0.1, actionIds: expect.arrayContaining(["bow.shot"]) } });
  });
});

async function openSelectedCharacter(running: RunningGameServer, name: string): Promise<WebSocket> {
  const socket = new WebSocket(running.address.replace("http", "ws"));
  await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  const authenticated = waitForMessage(socket, "auth.success");
  socket.send(encodeMessage({ type: "auth", requestId: "auth", payload: { idToken: "valid" } }));
  await authenticated;
  const creation = waitForMessage(socket, "character.created");
  socket.send(encodeMessage({ type: "character.create", requestId: "create", payload: { name, gender: "male" } }));
  const created = await creation;
  if (created.type !== "character.created") throw new Error("Expected character.created");
  const selection = waitForMessage(socket, "character.selected");
  socket.send(encodeMessage({ type: "character.select", requestId: "select", payload: { characterId: created.payload.character.id } }));
  await selection;
  return socket;
}

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
