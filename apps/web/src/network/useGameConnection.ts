import { decodeServerMessage, encodeMessage, type ActionOutcome, type CharacterGender, type CharacterSummary, type SkillLock } from "@eldoria/game-protocol";
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
  lastOutcome: ActionOutcome | null;
  lastCraft: { recipeId: string; success: boolean; message: string; chance: number | null } | null;
  createCharacter: (name: string, gender: CharacterGender) => void;
  selectCharacter: (characterId: string) => void;
  setSkillLock: (skillId: string, lock: SkillLock) => void;
  eatItem: (itemId: string) => void;
  equipItem: (itemId: string | null) => void;
  craft: (recipeId: string) => void;
};

type ConnectionState = Omit<GameConnection, "createCharacter" | "selectCharacter" | "setSkillLock" | "eatItem" | "equipItem" | "craft">;

const initialState: ConnectionState = { status: "connecting", label: "Connecting", message: "Opening a path to the realm…", latency: null, characters: [], charactersReady: false, selectedCharacter: null, lastOutcome: null, lastCraft: null };

export function useGameConnection(user: User): GameConnection {
  const [state, setState] = useState(initialState);
  const socketRef = useRef<WebSocket | null>(null);
  const selectedCharacterIdRef = useRef<string | null>(null);

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
    const sendInteract = (event: Event) => {
      const detail = (event as CustomEvent<{ objectId: string }>).detail;
      if (!detail?.objectId || socket?.readyState !== WebSocket.OPEN || !authenticatedUid) return;
      socket.send(encodeMessage({ type: "world.interact", requestId: crypto.randomUUID(), payload: { objectId: detail.objectId } }));
    };
    window.addEventListener("eldoria:move-intent", sendMove);
    window.addEventListener("eldoria:interact", sendInteract);

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
          if (selectedCharacterIdRef.current && socket?.readyState === WebSocket.OPEN) {
            socket.send(encodeMessage({ type: "character.select", requestId: crypto.randomUUID(), payload: { characterId: selectedCharacterIdRef.current } }));
          }
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
          selectedCharacterIdRef.current = character.id;
          window.dispatchEvent(new CustomEvent("eldoria:player-state", { detail: character.position }));
          window.dispatchEvent(new CustomEvent("eldoria:zone-change", { detail: character.position.zoneId }));
          setState((current) => ({ ...current, selectedCharacter: character, message: `Entering the realm as ${character.name}.` }));
        }
        if (message.type === "player.state" && message.payload.uid === authenticatedUid) {
          window.dispatchEvent(new CustomEvent("eldoria:player-state", { detail: message.payload.position }));
          window.dispatchEvent(new CustomEvent("eldoria:zone-change", { detail: message.payload.position.zoneId }));
        }
        if (message.type === "world.action") {
          window.dispatchEvent(new CustomEvent("eldoria:world-action", { detail: { objectId: message.payload.objectId, actionId: message.payload.actionId, success: message.payload.outcome?.success ?? true, target: message.payload.target ?? null, reward: message.payload.reward ?? null } }));
          setState((current) => ({
            ...current,
            message: message.payload.message,
            lastOutcome: message.payload.outcome ?? null,
            selectedCharacter: current.selectedCharacter && message.payload.survival ? { ...current.selectedCharacter, survival: message.payload.survival } : current.selectedCharacter,
          }));
        }
        if (message.type === "skill.locked") {
          setState((current) => ({ ...current, selectedCharacter: current.selectedCharacter ? { ...current.selectedCharacter, survival: message.payload.survival } : current.selectedCharacter }));
        }
        if (message.type === "item.eaten") {
          setState((current) => ({
            ...current,
            message: message.payload.message,
            selectedCharacter: current.selectedCharacter ? { ...current.selectedCharacter, survival: message.payload.survival } : current.selectedCharacter,
          }));
        }
        if (message.type === "item.equipped" || message.type === "craft.result") {
          setState((current) => ({
            ...current,
            ...(message.type === "craft.result"
              ? { message: message.payload.message, lastCraft: { recipeId: message.payload.recipeId, success: message.payload.success, message: message.payload.message, chance: message.payload.outcome?.chance ?? null } }
              : {}),
            selectedCharacter: current.selectedCharacter ? { ...current.selectedCharacter, survival: message.payload.survival } : current.selectedCharacter,
          }));
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
      window.removeEventListener("eldoria:interact", sendInteract);
      socket?.close();
      socketRef.current = null;
    };
  }, [user]);

  return {
    ...state,
    createCharacter: (name, gender) => sendCharacterCommand({ type: "character.create", requestId: crypto.randomUUID(), payload: { name, gender } }),
    selectCharacter: (characterId) => {
      selectedCharacterIdRef.current = characterId;
      sendCharacterCommand({ type: "character.select", requestId: crypto.randomUUID(), payload: { characterId } });
    },
    setSkillLock: (skillId, lock) => sendCharacterCommand({ type: "skill.lock", requestId: crypto.randomUUID(), payload: { skillId, lock } }),
    eatItem: (itemId) => sendCharacterCommand({ type: "item.eat", requestId: crypto.randomUUID(), payload: { itemId } }),
    equipItem: (itemId) => sendCharacterCommand({ type: "item.equip", requestId: crypto.randomUUID(), payload: { itemId } }),
    craft: (recipeId) => sendCharacterCommand({ type: "craft.attempt", requestId: crypto.randomUUID(), payload: { recipeId } }),
  };
}
