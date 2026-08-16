import { createServer, type Server as HttpServer } from "node:http";
import { decodeClientMessage, encodeMessage } from "@eldoria/game-protocol";
import { WebSocketServer } from "ws";
import type { GameServerConfig } from "./config";
import type { VerifyIdToken } from "./auth-verifier";
import { RuntimeWorld } from "./world";

export type RunningGameServer = {
  address: string;
  close: () => Promise<void>;
};

export function createGameServer(config: GameServerConfig, dependencies: { verifyIdToken: VerifyIdToken }): Promise<RunningGameServer> {
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
        try {
          const identity = await dependencies.verifyIdToken(message.payload.idToken);
          uid = identity.uid;
          const player = world.join(uid);
          socket.send(encodeMessage({ type: "auth.success", requestId: message.requestId, payload: { uid, position: player.position } }));
        } catch {
          socket.send(encodeMessage({ type: "error", requestId: message.requestId, payload: { code: "auth.invalid", message: "Firebase ID token validation failed." } }));
          socket.close(1008, "Authentication required");
        }
      } else if (message.type === "player.move") {
        if (!uid) {
          socket.send(encodeMessage({ type: "error", requestId: message.requestId, payload: { code: "auth.required", message: "Authenticate before sending gameplay commands." } }));
          return;
        }
        world.setDirection(uid, message.payload.direction, message.payload.sequence);
      }
    });
    socket.on("close", () => { if (uid) world.leave(uid); });
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
