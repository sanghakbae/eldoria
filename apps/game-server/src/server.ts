import { createServer, type Server as HttpServer } from "node:http";
import { decodeClientMessage, encodeMessage, type CharacterSummary } from "@eldoria/game-protocol";
import { WebSocketServer } from "ws";
import type { GameServerConfig } from "./config";
import type { VerifyIdToken } from "./auth-verifier";
import { CharacterRepositoryError, type CharacterRepository } from "./character-repository";
import { RuntimeWorld } from "./world";

export type RunningGameServer = {
  address: string;
  close: () => Promise<void>;
};

export function createGameServer(config: GameServerConfig, dependencies: { verifyIdToken: VerifyIdToken; characters: CharacterRepository }): Promise<RunningGameServer> {
  const world = new RuntimeWorld();
  const httpServer: HttpServer = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ status: "ok", service: "eldoria-game-server" }));
      return;
    }
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  const webSocketServer = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 });
  webSocketServer.on("connection", (socket, request) => {
    let uid: string | null = null;
    let selectedCharacterId: string | null = null;
    const remoteAddress = request.socket.remoteAddress ?? "unknown";
    console.info(JSON.stringify({ event: "connection", remoteAddress }));

    socket.on("message", async (data) => {
      const message = decodeClientMessage(data.toString());
      if (!message) {
        socket.send(encodeMessage({ type: "error", requestId: "unknown", payload: { code: "invalid_message", message: "Message did not match the game protocol." } }));
        return;
      }

      if (message.type === "connection.hello") {
        socket.send(encodeMessage({ type: "connection.ready", requestId: message.requestId, payload: { serverTime: Date.now(), motd: "The road to Mossward is open." } }));
      } else if (message.type === "connection.ping") {
        socket.send(encodeMessage({ type: "connection.pong", requestId: message.requestId, payload: { serverTime: Date.now() } }));
      } else if (message.type === "auth") {
        let identity: { uid: string };
        try {
          identity = await dependencies.verifyIdToken(message.payload.idToken);
        } catch {
          socket.send(encodeMessage({ type: "error", requestId: message.requestId, payload: { code: "auth.invalid", message: "Firebase ID token validation failed." } }));
          socket.close(1008, "Authentication required");
          return;
        }
        uid = identity.uid;
        socket.send(encodeMessage({ type: "auth.success", requestId: message.requestId, payload: { uid } }));
        try {
          const characters = await dependencies.characters.list(uid);
          socket.send(encodeMessage({ type: "character.list", requestId: message.requestId, payload: { characters } }));
        } catch (error) {
          console.error(JSON.stringify({ event: "persistence.error", uid, action: "character.list", message: error instanceof Error ? error.message : String(error) }));
          sendError(socket, message.requestId, "persistence.failed", "Character records are temporarily unavailable.");
        }
      } else if (message.type === "character.create") {
        if (!uid) {
          sendError(socket, message.requestId, "auth.required", "Authenticate before creating a character.");
          return;
        }
        try {
          const character = await dependencies.characters.create(uid, message.payload.name);
          socket.send(encodeMessage({ type: "character.created", requestId: message.requestId, payload: { character } }));
        } catch (error) {
          const repositoryError = error instanceof CharacterRepositoryError ? error : undefined;
          sendError(socket, message.requestId, repositoryError?.code ?? "persistence.failed", repositoryError?.message ?? "Character creation failed.");
        }
      } else if (message.type === "character.select") {
        if (!uid) {
          sendError(socket, message.requestId, "auth.required", "Authenticate before selecting a character.");
          return;
        }
        let character: CharacterSummary | null;
        try {
          character = await dependencies.characters.getOwned(uid, message.payload.characterId);
        } catch (error) {
          console.error(JSON.stringify({ event: "persistence.error", uid, action: "character.select", message: error instanceof Error ? error.message : String(error) }));
          sendError(socket, message.requestId, "persistence.failed", "Character records are temporarily unavailable.");
          return;
        }
        if (!character) {
          sendError(socket, message.requestId, "character.not_found", "Character was not found.");
          return;
        }
        world.leave(uid);
        world.join(uid, character.position);
        selectedCharacterId = character.id;
        socket.send(encodeMessage({ type: "character.selected", requestId: message.requestId, payload: { character } }));
      } else if (message.type === "player.move") {
        if (!uid) {
          socket.send(encodeMessage({ type: "error", requestId: message.requestId, payload: { code: "auth.required", message: "Authenticate before sending gameplay commands." } }));
          return;
        }
        if (!selectedCharacterId) {
          sendError(socket, message.requestId, "character.required", "Select a character before moving.");
          return;
        }
        world.setDirection(uid, message.payload.direction, message.payload.sequence);
      }
    });
    socket.on("close", () => {
      if (!uid) return;
      const player = world.get(uid);
      if (player && selectedCharacterId) {
        void dependencies.characters.savePosition(uid, selectedCharacterId, player.position).catch((error: unknown) => {
          console.error(JSON.stringify({ event: "persistence.error", uid, characterId: selectedCharacterId, message: error instanceof Error ? error.message : String(error) }));
        });
      }
      world.leave(uid);
    });
  });

  const tick = setInterval(() => {
    const players = world.tick(0.05);
    for (const socket of webSocketServer.clients) {
      if (socket.readyState !== socket.OPEN) continue;
      for (const player of players) socket.send(encodeMessage({ type: "player.state", requestId: `tick-${player.sequence}`, payload: { uid: player.uid, sequence: player.sequence, position: player.position } }));
    }
  }, 50);

  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.port, config.host, () => {
      httpServer.off("error", reject);
      const address = httpServer.address();
      const port = typeof address === "object" && address ? address.port : config.port;
      resolve({
        address: `http://${config.host}:${port}`,
        close: () => new Promise<void>((closeResolve, closeReject) => {
          clearInterval(tick);
          webSocketServer.close();
          httpServer.close((error) => error ? closeReject(error) : closeResolve());
        }),
      });
    });
  });
}

function sendError(socket: { send(data: string): void }, requestId: string, code: string, message: string) {
  socket.send(encodeMessage({ type: "error", requestId, payload: { code, message } }));
}
