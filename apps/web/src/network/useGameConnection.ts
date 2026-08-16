import { decodeServerMessage, encodeMessage, type CharacterSummary } from "@eldoria/game-protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { resolveGameServerUrl } from "./connection";

export type GameConnection = {
  status: "connecting" | "online" | "offline";
  label: string;
  message: string;
  latency: number | null;
  characters: CharacterSummary[];
  charactersReady: boolean;
  selectedCharacter: CharacterSummary | null;
  createCharacter: (name: string) => void;
  selectCharacter: (characterId: string) => void;
};

type ConnectionState = Omit<GameConnection, "createCharacter" | "selectCharacter">;

const initialState: ConnectionState = { status: "connecting", label: "Connecting", message: "Opening a path to the realm…", latency: null, characters: [], charactersReady: false, selectedCharacter: null };

export function useGameConnection(user: User): GameConnection {
  const [state, setState] = useState(initialState);
  const socketRef = useRef<WebSocket | null>(null);

  const sendCharacterCommand = useCallback((message: Parameters<typeof encodeMessage>[0]) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(encodeMessage(message));
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    let pingTimer: number | undefined;
    let closed = false;
    const sentAt = new Map<string, number>();
    let authenticatedUid: string | null = null;
    let moveSequence = 0;

    const sendMove = (event: Event) => {
      const detail = (event as CustomEvent<{ x: number; y: number }>).detail;
      if (!detail || socket?.readyState !== WebSocket.OPEN || !authenticatedUid) return;
      moveSequence += 1;
      socket.send(encodeMessage({ type: "player.move", requestId: `move-${moveSequence}`, payload: { sequence: moveSequence, direction: detail } }));
    };
    window.addEventListener("eldoria:move-intent", sendMove);

    const connect = () => {
      const url = resolveGameServerUrl(window.location, import.meta.env.VITE_GAME_SERVER_URL);
      setState((current) => ({ ...current, status: "connecting", label: "Connecting" }));
      socket = new WebSocket(url);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        const requestId = crypto.randomUUID();
        socket?.send(encodeMessage({ type: "connection.hello", requestId, payload: { clientVersion: "0.1.0" } }));
      });

      socket.addEventListener("message", (event) => {
        const message = decodeServerMessage(String(event.data));
        if (!message) return;
        if (message.type === "connection.ready") {
          void user.getIdToken().then((idToken) => {
            if (socket?.readyState !== WebSocket.OPEN) return;
            const requestId = crypto.randomUUID();
            socket.send(encodeMessage({ type: "auth", requestId, payload: { idToken } }));
          });
        }
        if (message.type === "auth.success") {
          authenticatedUid = message.payload.uid;
          setState((current) => ({ ...current, status: "online", label: "Realm online", message: "Choose a character to enter the realm.", latency: null }));
          pingTimer = window.setInterval(() => {
            if (socket?.readyState !== WebSocket.OPEN) return;
            const requestId = crypto.randomUUID();
            sentAt.set(requestId, performance.now());
            socket.send(encodeMessage({ type: "connection.ping", requestId, payload: {} }));
          }, 5000);
        }
        if (message.type === "character.list") {
          setState((current) => ({ ...current, characters: message.payload.characters, charactersReady: true }));
        }
        if (message.type === "character.created") {
          setState((current) => ({ ...current, characters: [...current.characters, message.payload.character], message: `${message.payload.character.name} is ready.` }));
        }
        if (message.type === "character.selected") {
          const character = message.payload.character;
          window.dispatchEvent(new CustomEvent("eldoria:player-state", { detail: character.position }));
          window.dispatchEvent(new CustomEvent("eldoria:zone-change", { detail: character.position.zoneId }));
          setState((current) => ({ ...current, selectedCharacter: character, message: `Entering the realm as ${character.name}.` }));
        }
        if (message.type === "player.state" && message.payload.uid === authenticatedUid) {
          window.dispatchEvent(new CustomEvent("eldoria:player-state", { detail: message.payload.position }));
          window.dispatchEvent(new CustomEvent("eldoria:zone-change", { detail: message.payload.position.zoneId }));
        }
        if (message.type === "connection.pong") {
          const start = sentAt.get(message.requestId);
          if (start !== undefined) {
            const latency = Math.max(1, Math.round(performance.now() - start));
            sentAt.delete(message.requestId);
            setState((current) => ({ ...current, latency }));
          }
        }
        if (message.type === "error" && message.payload.code !== "auth.invalid") {
          setState((current) => ({ ...current, message: message.payload.message }));
        }
      });

      socket.addEventListener("close", () => {
        if (pingTimer) window.clearInterval(pingTimer);
        setState((current) => ({ ...current, status: "offline", label: "Realm offline", message: "The game server is unavailable. Retrying…", latency: null }));
        if (!closed) retry = window.setTimeout(connect, 2000);
      });

      socket.addEventListener("error", () => socket?.close());
    };

    connect();
    return () => {
      closed = true;
      if (retry) window.clearTimeout(retry);
      if (pingTimer) window.clearInterval(pingTimer);
      window.removeEventListener("eldoria:move-intent", sendMove);
      socket?.close();
      socketRef.current = null;
    };
  }, [user]);

  return {
    ...state,
    createCharacter: (name) => sendCharacterCommand({ type: "character.create", requestId: crypto.randomUUID(), payload: { name } }),
    selectCharacter: (characterId) => sendCharacterCommand({ type: "character.select", requestId: crypto.randomUUID(), payload: { characterId } }),
  };
}
