import { decodeServerMessage, encodeMessage, type ActionOutcome, type CharacterGender, type CharacterSummary, type SkillLock } from "@eldoria/game-protocol";
import { createInitialSurvivalState, findTool, foodCatalog, getZoneDefinition, nutrientIds } from "@eldoria/game-data";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { firestore } from "../firebase/client";
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

const localCharacterKey = (uid: string) => `eldoria.local-character.${uid}`;

function readLocalCharacter(uid: string): CharacterSummary | null {
  try {
    const value = localStorage.getItem(localCharacterKey(uid));
    return value ? JSON.parse(value) as CharacterSummary : null;
  } catch {
    return null;
  }
}

function writeLocalCharacter(uid: string, character: CharacterSummary) {
  localStorage.setItem(localCharacterKey(uid), JSON.stringify(character));
}

function fallbackCharacterName(user: User): string {
  const candidate = (user.displayName ?? user.email?.split("@")[0] ?? "Wanderer").trim().replace(/[^\p{L}\p{N} '\-]/gu, " ").replace(/\s+/g, " ").slice(0, 20).trim();
  return candidate.length >= 2 ? candidate : "Wanderer";
}

const localWildlifeCombat: Record<string, { health: number; retaliation: number; reward: { itemId: string; quantity: number } }> = {
  Rabbit: { health: 3, retaliation: 1, reward: { itemId: "meat.rabbit", quantity: 2 } }, Deer: { health: 8, retaliation: 5, reward: { itemId: "meat.deer", quantity: 8 } }, Boar: { health: 11, retaliation: 8, reward: { itemId: "meat.wild-boar", quantity: 10 } },
  Wolf: { health: 10, retaliation: 9, reward: { itemId: "meat.wolf", quantity: 4 } }, Fox: { health: 5, retaliation: 3, reward: { itemId: "meat.fox", quantity: 2 } }, Bear: { health: 24, retaliation: 16, reward: { itemId: "meat.bear", quantity: 18 } },
  Bison: { health: 20, retaliation: 13, reward: { itemId: "meat.bison", quantity: 16 } }, Goat: { health: 7, retaliation: 4, reward: { itemId: "meat.goat", quantity: 5 } }, Turkey: { health: 4, retaliation: 2, reward: { itemId: "bird.turkey", quantity: 3 } },
  Turtle: { health: 9, retaliation: 2, reward: { itemId: "meat.turtle", quantity: 2 } }, Hare: { health: 4, retaliation: 1, reward: { itemId: "meat.hare", quantity: 2 } },
};

export function useGameConnection(user: User): GameConnection {
  const [state, setState] = useState(initialState);
  const socketRef = useRef<WebSocket | null>(null);
  const selectedCharacterIdRef = useRef<string | null>(null);
  const restoringCharacterRef = useRef(false);
  const stateRef = useRef(state);
  const localWildlifeHealthRef = useRef(new Map<string, number>());
  useEffect(() => { stateRef.current = state; }, [state]);
  // Firestore is the character authority in every environment unless a dedicated game server URL is
  // explicitly supplied. Local Vite reloads must never swap persistence to an in-memory repository.
  const firebaseMode = true;

  const sendCharacterCommand = useCallback((message: Parameters<typeof encodeMessage>[0]) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(encodeMessage(message));
  }, []);

  useEffect(() => {
    if (firebaseMode) {
      let cancelled = false;
      let positionSave: number | undefined;
      let pendingPosition: CharacterSummary["position"] | undefined;
      const recoverDefeatedCharacter = (defeatedCharacter: CharacterSummary) => {
        window.setTimeout(() => {
          if (cancelled) return;
          const latest = stateRef.current.selectedCharacter;
          if (!latest || latest.id !== defeatedCharacter.id || (latest.survival.health?.current ?? 1) > 0) return;
          const position = { zoneId: "untamedWilds", x: 836, y: 470 };
          const survival = { ...latest.survival, health: { current: latest.survival.health?.maximum ?? 100, maximum: latest.survival.health?.maximum ?? 100 } };
          const recovered = { ...latest, position, survival };
          setState((current) => ({ ...current, selectedCharacter: recovered, characters: current.characters.map((candidate) => candidate.id === recovered.id ? recovered : candidate), message: "You regain consciousness in the meadow." }));
          void updateDoc(doc(firestore, "characters", recovered.id), { position, survival, updatedAt: serverTimestamp() });
          window.dispatchEvent(new CustomEvent("eldoria:player-state", { detail: position }));
          window.dispatchEvent(new CustomEvent("eldoria:zone-change", { detail: position.zoneId }));
        }, 1200);
      };
      const persistPosition = (event: Event) => {
        const position = (event as CustomEvent<CharacterSummary["position"]>).detail;
        const characterId = selectedCharacterIdRef.current;
        if (!position || !characterId) return;
        pendingPosition = position;
        setState((current) => ({
          ...current,
          selectedCharacter: current.selectedCharacter ? { ...current.selectedCharacter, position } : current.selectedCharacter,
          characters: current.characters.map((character) => character.id === characterId ? { ...character, position } : character),
        }));
        if (positionSave !== undefined) return;
        positionSave = window.setTimeout(() => {
          positionSave = undefined;
          if (!pendingPosition) return;
          const saved = pendingPosition;
          pendingPosition = undefined;
          void updateDoc(doc(firestore, "characters", characterId), { position: saved, updatedAt: serverTimestamp() });
        }, 1000);
      };
      const handleWildlifeCombat = (event: Event) => {
        const interaction = (event as CustomEvent<{ objectId: string; x?: number; y?: number }>).detail;
        const objectId = interaction?.objectId;
        const character = stateRef.current.selectedCharacter;
        if (!objectId || !character) return;
        const object = getZoneDefinition(character.position.zoneId)?.layers.objects.find((candidate) => candidate.id === objectId);
        if (!object?.type.startsWith("wildlifeSpawn")) return;
        const targetX = interaction.x ?? object.x;
        const targetY = interaction.y ?? object.y;
        if (Math.hypot(character.position.x - targetX, character.position.y - targetY) > 80) {
          setState((current) => ({ ...current, message: "맨손 사냥은 팔이 닿는 거리에서만 가능합니다." }));
          return;
        }
        const species = object.type.slice("wildlifeSpawn".length);
        const profile = localWildlifeCombat[species];
        if (!profile) return;
        const combatKey = `${character.position.zoneId}:${objectId}`;
        const currentHealth = localWildlifeHealthRef.current.get(combatKey) ?? profile.health;
        const nextHealth = Math.max(0, currentHealth - 1);
        const defeated = nextHealth <= 0;
        localWildlifeHealthRef.current.set(combatKey, defeated ? profile.health : nextHealth);
        const currentPlayerHealth = character.survival.health ?? { current: 100, maximum: 100 };
        const nextPlayerHealth = defeated ? currentPlayerHealth.current : Math.max(0, currentPlayerHealth.current - profile.retaliation);
        const playerDefeated = !defeated && nextPlayerHealth <= 0;
        const survival = { ...character.survival, health: { ...currentPlayerHealth, current: nextPlayerHealth } };
        const updated = { ...character, survival };
        setState((current) => ({ ...current, selectedCharacter: updated, characters: current.characters.map((candidate) => candidate.id === updated.id ? updated : candidate), message: defeated ? `${species} defeated.` : `${species} strikes back for ${profile.retaliation}.` }));
        void updateDoc(doc(firestore, "characters", character.id), { survival, updatedAt: serverTimestamp() });
        window.dispatchEvent(new CustomEvent("eldoria:world-action", { detail: {
          objectId,
          actionId: "club.strike",
          success: true,
          target: { health: nextHealth, maximumHealth: profile.health, defeated },
          reward: defeated ? profile.reward : null,
          combat: defeated ? null : { counterDamage: profile.retaliation, playerDefeated },
        } }));
        if (playerDefeated) recoverDefeatedCharacter(updated);
      };
      const handleLoot = (event: Event) => {
        const detail = (event as CustomEvent<{ reward: { itemId: string; quantity: number } }>).detail;
        const character = stateRef.current.selectedCharacter;
        if (!detail?.reward || !character) return;
        const inventory = [...(character.survival.inventory ?? [])];
        const stack = inventory.find((candidate) => candidate.itemId === detail.reward.itemId);
        if (stack) stack.quantity += detail.reward.quantity; else inventory.push({ ...detail.reward });
        const survival = { ...character.survival, inventory };
        const updated = { ...character, survival };
        setState((current) => ({ ...current, selectedCharacter: updated, characters: current.characters.map((candidate) => candidate.id === updated.id ? updated : candidate), message: `전리품 획득: ${detail.reward.itemId} ×${detail.reward.quantity}` }));
        void updateDoc(doc(firestore, "characters", character.id), { survival, updatedAt: serverTimestamp() });
      };
      const handleLocalResource = (event: Event) => {
        const objectId = (event as CustomEvent<{ objectId: string }>).detail?.objectId;
        const character = stateRef.current.selectedCharacter;
        if (!objectId || !character) return;
        const object = getZoneDefinition(character.position.zoneId)?.layers.objects.find((candidate) => candidate.id === objectId);
        if (!object || object.type.startsWith("wildlifeSpawn")) return;
        if (Math.hypot(character.position.x - object.x, character.position.y - object.y) > 260) return;
        const equipped = character.survival.equipment?.mainHand ?? character.survival.equipped ?? null;
        const axes = ["tool.hand-axe", "tool.copper-axe", "tool.iron-axe", "tool.steel-axe"];
        const picks = ["tool.pickaxe", "tool.copper-pickaxe", "tool.iron-pickaxe", "tool.steel-pickaxe"];
        let actionId = "";
        let reward: { itemId: string; quantity: number } | null = null;
        let message = "이 대상은 아직 사용할 수 없습니다.";
        if (object.type === "fishingWater") {
          const hasFishingRod = (character.survival.inventory ?? []).some((stack) => stack.itemId === "tool.fishing-rod" && stack.quantity > 0);
          if (!hasFishingRod) { setState((current) => ({ ...current, message: "낚싯대가 있어야 낚시할 수 있습니다." })); return; }
          actionId = "fishing.cast"; reward = { itemId: "fish.trout", quantity: 1 }; message = "연못에서 숭어를 낚았습니다.";
        } else if (object.type === "wildTree") {
          if (!axes.includes(equipped ?? "")) { setState((current) => ({ ...current, message: "나무를 베려면 도끼가 필요합니다." })); return; }
          actionId = "material.process"; reward = { itemId: "wood.raw-log", quantity: 1 }; message = "나무에서 통나무를 얻었습니다.";
        } else if (object.type === "wildFruitTree") {
          actionId = "fruit.gather"; reward = { itemId: "fruit.apple", quantity: 1 }; message = "잘 익은 사과를 땄습니다.";
        } else if (object.type === "looseStone") {
          actionId = "stone.flake"; reward = { itemId: "stone.raw", quantity: 1 }; message = "돌덩이를 주웠습니다.";
        } else if (object.type === "fallenBranch") {
          actionId = "material.process"; reward = { itemId: "wood.branch", quantity: 1 }; message = "나뭇가지를 주웠습니다.";
        } else if (object.type.endsWith("OreDeposit") || object.type === "coalDeposit") {
          if (!picks.includes(equipped ?? "")) { setState((current) => ({ ...current, message: "광석을 캐려면 곡괭이가 필요합니다." })); return; }
          actionId = "stone.flake"; reward = { itemId: "stone.raw", quantity: 3 }; message = "광맥에서 돌을 캐냈습니다.";
        }
        if (!actionId || !reward) return;
        const inventory = [...(character.survival.inventory ?? [])];
        const stack = inventory.find((candidate) => candidate.itemId === reward.itemId);
        if (stack) stack.quantity += reward.quantity; else inventory.push({ ...reward });
        const survival = { ...character.survival, inventory };
        const updated = { ...character, survival };
        setState((current) => ({ ...current, selectedCharacter: updated, characters: current.characters.map((candidate) => candidate.id === updated.id ? updated : candidate), message }));
        void updateDoc(doc(firestore, "characters", character.id), { survival, updatedAt: serverTimestamp() });
        window.dispatchEvent(new CustomEvent("eldoria:world-action", { detail: { objectId, actionId, success: true, target: null, reward, combat: null } }));
      };
      const handleWildlifeAggression = (event: Event) => {
        const objectId = (event as CustomEvent<{ objectId: string }>).detail?.objectId;
        const character = stateRef.current.selectedCharacter;
        if (!objectId || !character) return;
        const object = getZoneDefinition(character.position.zoneId)?.layers.objects.find((candidate) => candidate.id === objectId);
        if (!object?.type.startsWith("wildlifeSpawn")) return;
        const species = object.type.slice("wildlifeSpawn".length);
        const profile = localWildlifeCombat[species];
        if (!profile || (species !== "Wolf" && species !== "Bear")) return;
        const currentPlayerHealth = character.survival.health ?? { current: 100, maximum: 100 };
        const nextPlayerHealth = Math.max(0, currentPlayerHealth.current - profile.retaliation);
        const playerDefeated = nextPlayerHealth <= 0;
        const survival = { ...character.survival, health: { ...currentPlayerHealth, current: nextPlayerHealth } };
        const updated = { ...character, survival };
        setState((current) => ({ ...current, selectedCharacter: updated, characters: current.characters.map((candidate) => candidate.id === updated.id ? updated : candidate), message: `${species} attacks first for ${profile.retaliation}.` }));
        void updateDoc(doc(firestore, "characters", character.id), { survival, updatedAt: serverTimestamp() });
        window.dispatchEvent(new CustomEvent("eldoria:world-action", { detail: {
          objectId,
          actionId: "wildlife.attack",
          success: true,
          target: null,
          reward: null,
          combat: { counterDamage: profile.retaliation, playerDefeated },
        } }));
        if (playerDefeated) recoverDefeatedCharacter(updated);
      };
      window.addEventListener("eldoria:player-state", persistPosition);
      window.addEventListener("eldoria:interact", handleWildlifeCombat);
      window.addEventListener("eldoria:interact", handleLocalResource);
      window.addEventListener("eldoria:wildlife-aggression", handleWildlifeAggression);
      window.addEventListener("eldoria:loot", handleLoot);
      void getDocs(query(collection(firestore, "characters"), where("ownerUid", "==", user.uid))).then((snapshot) => {
        if (cancelled) return;
        const characters = snapshot.docs.map((document) => {
          const data = document.data();
          const createdAt = typeof data.createdAt?.toDate === "function" ? data.createdAt.toDate().toISOString() : new Date().toISOString();
          return {
            id: document.id,
            name: String(data.name ?? "Wanderer"),
            gender: data.gender === "female" ? "female" as const : "male" as const,
            position: data.position && typeof data.position.x === "number" ? data.position : { zoneId: "untamedWilds", x: 836, y: 470 },
            createdAt,
            survival: data.survival ?? createInitialSurvivalState(createdAt),
          } satisfies CharacterSummary;
        });
        setState((current) => ({ ...current, status: "online", label: "Firebase realm", message: "Character records loaded.", characters, charactersReady: true }));
      }).catch((error: unknown) => {
        if (cancelled) return;
        setState((current) => ({ ...current, status: "offline", label: "Database unavailable", message: error instanceof Error ? error.message : String(error), charactersReady: true }));
      });
      return () => {
        cancelled = true;
        if (positionSave !== undefined) window.clearTimeout(positionSave);
        window.removeEventListener("eldoria:player-state", persistPosition);
        window.removeEventListener("eldoria:interact", handleWildlifeCombat);
        window.removeEventListener("eldoria:interact", handleLocalResource);
        window.removeEventListener("eldoria:wildlife-aggression", handleWildlifeAggression);
        window.removeEventListener("eldoria:loot", handleLoot);
      };
    }

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
    const sendObserve = (event: Event) => {
      const zoneId = (event as CustomEvent<{ zoneId: string }>).detail?.zoneId;
      if (!zoneId || socket?.readyState !== WebSocket.OPEN || !authenticatedUid) return;
      socket.send(encodeMessage({ type: "world.observe", requestId: crypto.randomUUID(), payload: { zoneId } }));
    };
    window.addEventListener("eldoria:move-intent", sendMove);
    window.addEventListener("eldoria:interact", sendInteract);
    window.addEventListener("eldoria:observe-world", sendObserve);

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
          if (message.payload.characters.length > 0) {
            const character = message.payload.characters[0]!;
            writeLocalCharacter(user.uid, character);
            setState((current) => ({ ...current, characters: message.payload.characters, charactersReady: true }));
          } else if (!restoringCharacterRef.current && socket?.readyState === WebSocket.OPEN) {
            // The local development server intentionally uses an in-memory repository and may restart
            // during hot reload. Recreate the same wanderer silently instead of asking the player to
            // create their account/character over and over.
            restoringCharacterRef.current = true;
            const cached = readLocalCharacter(user.uid);
            socket.send(encodeMessage({
              type: "character.create",
              requestId: crypto.randomUUID(),
              payload: { name: cached?.name ?? fallbackCharacterName(user), gender: cached?.gender ?? "male" },
            }));
            setState((current) => ({ ...current, charactersReady: false, message: "Restoring your wanderer…" }));
          }
        }
        if (message.type === "character.created") {
          const character = message.payload.character;
          restoringCharacterRef.current = false;
          writeLocalCharacter(user.uid, character);
          selectedCharacterIdRef.current = character.id;
          setState((current) => ({ ...current, characters: [character], charactersReady: true, message: `${character.name} is ready.` }));
          if (socket?.readyState === WebSocket.OPEN) socket.send(encodeMessage({ type: "character.select", requestId: crypto.randomUUID(), payload: { characterId: character.id } }));
        }
        if (message.type === "character.selected") {
          const character = message.payload.character;
          selectedCharacterIdRef.current = character.id;
          writeLocalCharacter(user.uid, character);
          window.dispatchEvent(new CustomEvent("eldoria:player-state", { detail: character.position }));
          window.dispatchEvent(new CustomEvent("eldoria:zone-change", { detail: character.position.zoneId }));
          setState((current) => ({ ...current, selectedCharacter: character, message: `Entering the realm as ${character.name}.` }));
        }
        if (message.type === "player.state" && message.payload.uid === authenticatedUid) {
          setState((current) => {
            if (!current.selectedCharacter) return current;
            const character = { ...current.selectedCharacter, position: message.payload.position };
            writeLocalCharacter(user.uid, character);
            return { ...current, selectedCharacter: character, characters: current.characters.map((candidate) => candidate.id === character.id ? character : candidate) };
          });
          window.dispatchEvent(new CustomEvent("eldoria:player-state", { detail: message.payload.position }));
          window.dispatchEvent(new CustomEvent("eldoria:zone-change", { detail: message.payload.position.zoneId }));
        }
        if (message.type === "world.snapshot") {
          window.dispatchEvent(new CustomEvent("eldoria:world-snapshot", { detail: message.payload }));
        }
        if (message.type === "world.object") {
          window.dispatchEvent(new CustomEvent("eldoria:world-object", { detail: message.payload.object }));
        }
        if (message.type === "world.action") {
          window.dispatchEvent(new CustomEvent("eldoria:world-action", { detail: { objectId: message.payload.objectId, actionId: message.payload.actionId, success: message.payload.outcome?.success ?? true, target: message.payload.target ?? null, reward: message.payload.reward ?? null, combat: message.payload.combat ?? null } }));
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
      window.removeEventListener("eldoria:observe-world", sendObserve);
      socket?.close();
      socketRef.current = null;
    };
  }, [firebaseMode, user]);

  return {
    ...state,
    createCharacter: (name, gender) => {
      if (!firebaseMode) {
        sendCharacterCommand({ type: "character.create", requestId: crypto.randomUUID(), payload: { name, gender } });
        return;
      }
      const createdAt = new Date().toISOString();
      const survival = createInitialSurvivalState(createdAt);
      void addDoc(collection(firestore, "characters"), { ownerUid: user.uid, name: name.trim(), gender, position: { zoneId: "untamedWilds", x: 836, y: 470 }, survival, startVersion: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }).then((reference) => {
        const character: CharacterSummary = { id: reference.id, name: name.trim(), gender, position: { zoneId: "untamedWilds", x: 836, y: 470 }, createdAt, survival };
        setState((current) => ({ ...current, characters: [...current.characters, character], message: `${character.name} is ready.` }));
      }).catch((error: unknown) => setState((current) => ({ ...current, message: error instanceof Error ? error.message : String(error) })));
    },
    selectCharacter: (characterId) => {
      selectedCharacterIdRef.current = characterId;
      if (firebaseMode) {
        const character = state.characters.find((candidate) => candidate.id === characterId);
        if (character) {
          window.dispatchEvent(new CustomEvent("eldoria:player-state", { detail: character.position }));
          window.dispatchEvent(new CustomEvent("eldoria:zone-change", { detail: character.position.zoneId }));
          setState((current) => ({ ...current, selectedCharacter: character, message: `Entering the realm as ${character.name}.` }));
        }
        return;
      }
      sendCharacterCommand({ type: "character.select", requestId: crypto.randomUUID(), payload: { characterId } });
    },
    setSkillLock: (skillId, lock) => {
      if (!firebaseMode) return sendCharacterCommand({ type: "skill.lock", requestId: crypto.randomUUID(), payload: { skillId, lock } });
      const character = state.selectedCharacter;
      if (!character) return;
      const survival = { ...character.survival, locks: { ...character.survival.locks, [skillId]: lock } };
      const next = { ...character, survival };
      setState((current) => ({ ...current, selectedCharacter: next, characters: current.characters.map((candidate) => candidate.id === next.id ? next : candidate) }));
      void updateDoc(doc(firestore, "characters", character.id), { survival, updatedAt: serverTimestamp() }).catch((error: unknown) => setState((current) => ({ ...current, message: error instanceof Error ? error.message : String(error) })));
    },
    eatItem: (itemId) => {
      const food = foodCatalog.find((candidate) => candidate.id === itemId);
      const character = state.selectedCharacter;
      if (!firebaseMode) return sendCharacterCommand({ type: "item.eat", requestId: crypto.randomUUID(), payload: { itemId } });
      if (!character || food?.category !== "fruit") return;
      const inventory = (character.survival.inventory ?? []).map((stack) => stack.itemId === itemId ? { ...stack, quantity: stack.quantity - 1 } : stack).filter((stack) => stack.quantity > 0);
      const nutrition = { ...character.survival.nutrition };
      for (const nutrient of nutrientIds) nutrition[nutrient] = Math.min(100, nutrition[nutrient] + food.nutrients[nutrient]);
      const currentHealth = character.survival.health ?? { current: 100, maximum: 100 };
      const healedHealth = Math.min(currentHealth.maximum, currentHealth.current + 12);
      const survival = { ...character.survival, inventory, nutrition, health: { ...currentHealth, current: healedHealth } };
      const updated = { ...character, survival };
      setState((current) => ({ ...current, selectedCharacter: updated, characters: current.characters.map((candidate) => candidate.id === updated.id ? updated : candidate), message: `${food.name.ko}을(를) 먹었습니다. 생명력 +${healedHealth - currentHealth.current}` }));
      void updateDoc(doc(firestore, "characters", character.id), { survival, updatedAt: serverTimestamp() });
    },
    equipItem: (itemId) => {
      if (!firebaseMode) return sendCharacterCommand({ type: "item.equip", requestId: crypto.randomUUID(), payload: { itemId } });
      const character = state.selectedCharacter;
      if (!character) return;
      const slot = itemId ? findTool(itemId)?.slot ?? "mainHand" : "mainHand";
      const survival = { ...character.survival, equipped: slot === "mainHand" ? itemId : character.survival.equipped, equipment: { ...character.survival.equipment, [slot]: itemId } };
      const next = { ...character, survival };
      setState((current) => ({ ...current, selectedCharacter: next, characters: current.characters.map((candidate) => candidate.id === next.id ? next : candidate), message: itemId ? "Item equipped." : "Item unequipped." }));
      void updateDoc(doc(firestore, "characters", character.id), { survival, updatedAt: serverTimestamp() }).catch((error: unknown) => setState((current) => ({ ...current, message: error instanceof Error ? error.message : String(error) })));
    },
    craft: (recipeId) => sendCharacterCommand({ type: "craft.attempt", requestId: crypto.randomUUID(), payload: { recipeId } }),
  };
}
