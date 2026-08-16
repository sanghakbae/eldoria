import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { decodeClientMessage, encodeMessage, type CharacterSummary } from "@eldoria/game-protocol";
import { WebSocketServer } from "ws";
import type { GameServerConfig } from "./config";
import type { VerifyIdToken } from "./auth-verifier";
import { CharacterRepositoryError, type CharacterRepository } from "./character-repository";
import { RuntimeWorld } from "./world";
import { MemorySkillConfigRepository, SkillConfigError, type SkillConfigRepository } from "./skill-config-repository";

export type RunningGameServer = {
  address: string;
  close: () => Promise<void>;
};

export function createGameServer(config: GameServerConfig, dependencies: { verifyIdToken: VerifyIdToken; characters: CharacterRepository; skills?: SkillConfigRepository }): Promise<RunningGameServer> {
  const world = new RuntimeWorld();
  const skills = dependencies.skills ?? new MemorySkillConfigRepository();
  const httpServer: HttpServer = createServer((request, response) => {
    void handleHttpRequest(request, response, dependencies.verifyIdToken, skills);
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

async function handleHttpRequest(request: IncomingMessage, response: ServerResponse, verifyIdToken: VerifyIdToken, skills: SkillConfigRepository) {
  response.setHeader("access-control-allow-origin", request.headers.origin === "https://eldoria.sanghak.kr" ? request.headers.origin : "http://localhost:5173");
  response.setHeader("access-control-allow-headers", "authorization,content-type");
  response.setHeader("access-control-allow-methods", "GET,PUT,OPTIONS");
  if (request.method === "OPTIONS") return sendJson(response, 204, null);
  if (request.url === "/health") return sendJson(response, 200, { status: "ok", service: "eldoria-game-server" });
  if (request.url !== "/admin/skill-config") return sendJson(response, 404, { error: "not_found" });

  try {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return sendJson(response, 401, { error: "auth.required" });
    const identity = await verifyIdToken(authorization.slice(7));
    if (!identity.admin) return sendJson(response, 403, { error: "admin.required" });
    if (request.method === "GET") return sendJson(response, 200, { skills: await skills.list() });
    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      if (!isRecord(body) || typeof body.skillId !== "string" || typeof body.actionsPerGain !== "number" || typeof body.gainAmount !== "number") return sendJson(response, 400, { error: "skill.invalid_payload" });
      return sendJson(response, 200, { skill: await skills.update(body.skillId, { actionsPerGain: body.actionsPerGain, gainAmount: body.gainAmount }, identity.uid) });
    }
    return sendJson(response, 405, { error: "method_not_allowed" });
  } catch (error) {
    const known = error instanceof SkillConfigError ? error : undefined;
    return sendJson(response, known ? 400 : 401, { error: known?.code ?? "auth.invalid", message: known?.message });
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(body === null ? undefined : JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error("Request body is too large.");
  }
  return JSON.parse(body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
