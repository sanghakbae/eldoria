import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { decodeClientMessage, encodeMessage, type CharacterSummary } from "@eldoria/game-protocol";
import { calculateSkillGain, createInitialSurvivalState, getZoneDefinition } from "@eldoria/game-data";
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
  const interactionCooldowns = new Map<string, number>();
  const wildlifeStates = new Map<string, { health: number; defeatedUntil: number }>();
  const denReturnPositions = new Map<string, { zoneId: string; x: number; y: number }>();
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
          const character = await dependencies.characters.create(uid, message.payload.name, message.payload.gender);
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
      } else if (message.type === "world.interact") {
        if (!uid || !selectedCharacterId) {
          sendError(socket, message.requestId, "character.required", "Select a character before interacting.");
          return;
        }
        const player = world.get(uid);
        const object = player ? getZoneDefinition(player.position.zoneId)?.layers.objects.find((candidate) => candidate.id === message.payload.objectId) : undefined;
        const interactionRange = object?.type.startsWith("wildlifeSpawn") ? 600 : 260;
        if (!player || !object || Math.hypot(player.position.x - object.x, player.position.y - object.y) > interactionRange) {
          sendError(socket, message.requestId, "interaction.too_far", "Move closer to the resource.");
          return;
        }
        if (object.type === "animalDenEntrance" || object.type === "animalDenExit") {
          if (object.type === "animalDenEntrance") denReturnPositions.set(uid, { ...player.position });
          const moved = object.type === "animalDenEntrance"
            ? world.teleport(uid, "animalDen", "arrival")
            : world.place(uid, denReturnPositions.get(uid) ?? { zoneId: "untamedWilds", x: 385, y: 300 });
          if (object.type === "animalDenExit") denReturnPositions.delete(uid);
          if (moved) socket.send(encodeMessage({ type: "world.action", requestId: message.requestId, payload: { objectId: object.id, actionId: "travel.enter", message: object.type === "animalDenEntrance" ? "Entered the wild animal den." : "Returned to the untamed wilds." } }));
          return;
        }
        let action = resolveResourceAction(object.type, object.id);
        if (object.type.startsWith("wildlifeSpawn")) {
          const species = object.type.endsWith("Rabbit") ? "rabbit" : object.type.endsWith("Deer") ? "deer" : "wild-boar";
          const maximumHealth = species === "rabbit" ? 3 : species === "deer" ? 8 : 11;
          const wildlifeKey = `${player.position.zoneId}:${object.id}`;
          const state = wildlifeStates.get(wildlifeKey) ?? { health: maximumHealth, defeatedUntil: 0 };
          if (state.defeatedUntil > Date.now()) {
            sendError(socket, message.requestId, "wildlife.defeated", "The animal has already been taken.");
            return;
          }
          if (state.defeatedUntil > 0) {
            state.health = maximumHealth;
            state.defeatedUntil = 0;
          }
          state.health -= 1;
          const defeated = state.health <= 0;
          if (defeated) {
            state.health = maximumHealth;
            state.defeatedUntil = Date.now() + 45_000;
          }
          wildlifeStates.set(wildlifeKey, state);
          action = {
            actionId: "club.strike",
            reward: defeated ? { itemId: `meat.${species}`, quantity: species === "rabbit" ? 2 : species === "deer" ? 8 : 10 } : undefined,
            message: defeated ? `Caught the ${species}.` : `Struck the ${species} with bare fists. ${state.health} health remains.`,
            cooldownMs: 700,
          };
        }
        if (!action) {
          sendError(socket, message.requestId, "interaction.unavailable", "This object cannot be used yet.");
          return;
        }
        const cooldownKey = `${uid}:${object.id}`;
        const now = Date.now();
        if ((interactionCooldowns.get(cooldownKey) ?? 0) > now) {
          sendError(socket, message.requestId, "interaction.cooldown", "Wait before using this resource again.");
          return;
        }
        interactionCooldowns.set(cooldownKey, now + action.cooldownMs);
        const character = await dependencies.characters.getOwned(uid, selectedCharacterId);
        if (!character) {
          sendError(socket, message.requestId, "character.not_found", "Character was not found.");
          return;
        }
        const survival = structuredClone(character.survival ?? createInitialSurvivalState());
        survival.inventory ??= [];
        survival.skills ??= {};
        if (action.reward) {
          const stack = survival.inventory.find((item) => item.itemId === action.reward?.itemId);
          if (stack) stack.quantity += action.reward.quantity;
          else survival.inventory.push({ ...action.reward });
        }
        const skillConfig = (await skills.list()).find((candidate) => candidate.actionIds.includes(action.actionId));
        if (skillConfig) {
          const progress = survival.skills[skillConfig.id] ?? { value: 0, completedActions: 0 };
          progress.completedActions += 1;
          progress.value += calculateSkillGain({ skill: skillConfig, completedActions: progress.completedActions, currentValue: progress.value, totalSkillValue: Object.values(survival.skills).reduce((sum, item) => sum + item.value, 0), difficultyFactor: 1 });
          survival.skills[skillConfig.id] = progress;
        }
        await dependencies.characters.saveSurvival(uid, selectedCharacterId, survival);
        socket.send(encodeMessage({ type: "world.action", requestId: message.requestId, payload: { objectId: object.id, actionId: action.actionId, message: action.message, ...(action.reward ? { reward: action.reward } : {}), survival } }));
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
      denReturnPositions.delete(uid);
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

type ResourceAction = { actionId: string; reward?: { itemId: string; quantity: number }; message: string; cooldownMs: number };

function resolveResourceAction(type: string, objectId: string): ResourceAction | null {
  if (type === "fishingWater") return { actionId: "fishing.cast", reward: { itemId: "fish.trout", quantity: 1 }, message: "Caught a trout from the pond.", cooldownMs: 3000 };
  if (type === "wildTree") return { actionId: "material.process", reward: { itemId: "wood.raw-log", quantity: 1 }, message: "Cut usable wood from the tree.", cooldownMs: 2200 };
  if (type === "wildFruitTree") return { actionId: "fruit.gather", reward: { itemId: objectId.includes("pear") ? "fruit.pear" : "fruit.apple", quantity: 1 }, message: "Gathered ripe wild fruit.", cooldownMs: 1200 };
  return null;
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
