import { decodeServerMessage, encodeMessage, type ActionOutcome, type BuiltStructure, type CharacterGender, type CharacterSummary, type SkillLock, type WorldObjectState } from "@eldoria/game-protocol";
import { calculateMiningYield, calculateSkillDamage, calculateSkillYield, craftingRecipes, createInitialSurvivalState, findSkillForAction, findTool, foodCatalog, getZoneDefinition, nutrientIds, resolveSkillAction } from "@eldoria/game-data";
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
const localPositionKey = (uid: string, characterId: string) => `eldoria.position.${uid}.${characterId}`;

type LocalPositionCheckpoint = { position: CharacterSummary["position"]; savedAt: number };

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

function readLocalPosition(uid: string, characterId: string): LocalPositionCheckpoint | null {
  try {
    const raw = localStorage.getItem(localPositionKey(uid, characterId));
    if (!raw) return null;
    const checkpoint = JSON.parse(raw) as LocalPositionCheckpoint;
    if (!checkpoint?.position || typeof checkpoint.position.x !== "number" || typeof checkpoint.position.y !== "number" || typeof checkpoint.position.zoneId !== "string" || typeof checkpoint.savedAt !== "number") return null;
    return checkpoint;
  } catch {
    return null;
  }
}

function writeLocalPosition(uid: string, characterId: string, position: CharacterSummary["position"]) {
  localStorage.setItem(localPositionKey(uid, characterId), JSON.stringify({ position, savedAt: Date.now() } satisfies LocalPositionCheckpoint));
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
  Eagle: { health: 7, retaliation: 0, reward: { itemId: "bird.eagle", quantity: 3 } }, Hawk: { health: 5, retaliation: 0, reward: { itemId: "bird.hawk", quantity: 2 } }, Falcon: { health: 5, retaliation: 0, reward: { itemId: "bird.falcon", quantity: 2 } },
  Vulture: { health: 7, retaliation: 0, reward: { itemId: "bird.vulture", quantity: 3 } }, Crow: { health: 3, retaliation: 0, reward: { itemId: "bird.crow", quantity: 1 } }, Owl: { health: 4, retaliation: 0, reward: { itemId: "bird.owl", quantity: 2 } },
  Gull: { health: 4, retaliation: 0, reward: { itemId: "bird.gull", quantity: 2 } }, Heron: { health: 5, retaliation: 0, reward: { itemId: "bird.heron", quantity: 2 } }, Crane: { health: 6, retaliation: 0, reward: { itemId: "bird.crane", quantity: 3 } },
  Parrot: { health: 3, retaliation: 0, reward: { itemId: "bird.parrot", quantity: 1 } }, Hornbill: { health: 5, retaliation: 0, reward: { itemId: "bird.hornbill", quantity: 2 } },
};

function wildlifeSpeciesFromType(type: string) {
  return type.startsWith("ambientBirdFlock") ? type.slice("ambientBirdFlock".length) : type.slice("wildlifeSpawn".length);
}

function isWildlifeType(type: string) {
  return type.startsWith("wildlifeSpawn") || type.startsWith("ambientBirdFlock");
}

const pondFish = [
  { itemId: "fish.carp", ko: "잉어" },
  { itemId: "fish.minnow", ko: "피라미" },
  { itemId: "fish.perch", ko: "농어" },
  { itemId: "fish.trout", ko: "송어" },
] as const;

export function useGameConnection(user: User): GameConnection {
  const [state, setState] = useState(initialState);
  const socketRef = useRef<WebSocket | null>(null);
  const selectedCharacterIdRef = useRef<string | null>(null);
  const restoringCharacterRef = useRef(false);
  const stateRef = useRef(state);
  const localWildlifeHealthRef = useRef(new Map<string, number>());
  const localResourceStateRef = useRef(new Map<string, { remaining: number; exhaustedUntil: number }>());
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
      let miningInterval: number | undefined;
      const recoverDefeatedCharacter = (defeatedCharacter: CharacterSummary) => {
        window.setTimeout(() => {
          if (cancelled) return;
          const latest = stateRef.current.selectedCharacter;
          if (!latest || latest.id !== defeatedCharacter.id || (latest.survival.health?.current ?? 1) > 0) return;
          const position = { zoneId: "untamedWilds", x: 836, y: 470 };
          const survival = { ...latest.survival, health: { current: latest.survival.health?.maximum ?? 100, maximum: latest.survival.health?.maximum ?? 100 } };
          const recovered = { ...latest, position, survival };
          setState((current) => ({ ...current, selectedCharacter: recovered, characters: current.characters.map((candidate) => candidate.id === recovered.id ? recovered : candidate), message: "You regain consciousness in the meadow." }));
          void updateDoc(doc(firestore, "characters", recovered.id), { position, survival, positionUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() });
          window.dispatchEvent(new CustomEvent("eldoria:player-state", { detail: position }));
          window.dispatchEvent(new CustomEvent("eldoria:zone-change", { detail: position.zoneId }));
        }, 1200);
      };
      const persistPosition = (event: Event) => {
        const position = (event as CustomEvent<CharacterSummary["position"]>).detail;
        const characterId = selectedCharacterIdRef.current;
        if (!position || !characterId) return;
        pendingPosition = position;
        // Browser reload can terminate Firestore's last debounced request. This synchronous,
        // per-account checkpoint preserves the exact final coordinate and is reconciled with the DB
        // timestamp on the next load rather than replacing Firestore as the shared authority.
        writeLocalPosition(user.uid, characterId, position);
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
          void updateDoc(doc(firestore, "characters", characterId), { position: saved, positionUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        }, 250);
      };
      const handleWildlifeCombat = (event: Event) => {
        const interaction = (event as CustomEvent<{ objectId: string; x?: number; y?: number }>).detail;
        const objectId = interaction?.objectId;
        const character = stateRef.current.selectedCharacter;
        if (!objectId || !character) return;
        const object = getZoneDefinition(character.position.zoneId)?.layers.objects.find((candidate) => candidate.id === objectId);
        if (!object || !isWildlifeType(object.type)) return;
        const targetX = interaction.x ?? object.x;
        const targetY = interaction.y ?? object.y;
        const equippedId = character.survival.equipment?.mainHand ?? character.survival.equipped ?? "";
        const equippedTool = equippedId ? findTool(equippedId) : undefined;
        const bowEquipped = equippedId.endsWith("-bow");
        const flyingBird = object.type.startsWith("ambientBirdFlock");
        if (flyingBird && !bowEquipped) {
          setState((current) => ({ ...current, message: "날아다니는 새는 활과 화살로 사냥해야 합니다." }));
          return;
        }
        const inventory = (character.survival.inventory ?? []).map((stack) => ({ ...stack }));
        const arrows = inventory.find((stack) => stack.itemId === "ammunition.arrow");
        if (bowEquipped && (!arrows || arrows.quantity < 1)) {
          setState((current) => ({ ...current, message: "화살이 없습니다. 화살을 제작해야 합니다." }));
          return;
        }
        const attackDistance = Math.hypot(character.position.x - targetX, character.position.y - targetY);
        if (attackDistance > (bowEquipped ? 420 : 80)) {
          setState((current) => ({ ...current, message: bowEquipped ? "활의 사거리 밖입니다." : "근접 공격은 팔이 닿는 거리에서만 가능합니다." }));
          return;
        }
        const species = wildlifeSpeciesFromType(object.type);
        const profile = localWildlifeCombat[species];
        if (!profile) return;
        const combatKey = `${character.position.zoneId}:${objectId}`;
        const currentHealth = localWildlifeHealthRef.current.get(combatKey) ?? profile.health;
        const actionId = bowEquipped ? "bow.shot" : equippedId.endsWith("-spear") ? "spear.thrust" : "weapon.strike";
        const skill = findSkillForAction(actionId);
        const skillValue = skill ? character.survival.skills?.[skill.id]?.value ?? 0 : 0;
        const skillResult = skill ? resolveSkillAction({
          skill,
          skills: character.survival.skills ?? {},
          locks: character.survival.locks ?? {},
          roll: Math.random(),
          successFloor: 0.35,
        }) : undefined;
        const hit = skillResult?.success ?? true;
        const damage = hit ? calculateSkillDamage(equippedTool?.damage ?? 1, skillValue) : 0;
        if (bowEquipped && arrows) arrows.quantity -= 1;
        const nextHealth = Math.max(0, currentHealth - damage);
        const defeated = hit && nextHealth <= 0;
        localWildlifeHealthRef.current.set(combatKey, defeated ? profile.health : nextHealth);
        const currentPlayerHealth = character.survival.health ?? { current: 100, maximum: 100 };
        const canCounter = !defeated && attackDistance <= 80;
        const nextPlayerHealth = canCounter ? Math.max(0, currentPlayerHealth.current - profile.retaliation) : currentPlayerHealth.current;
        const playerDefeated = canCounter && nextPlayerHealth <= 0;
        const survival = { ...character.survival, inventory: inventory.filter((stack) => stack.quantity > 0), skills: skillResult?.skills ?? character.survival.skills, health: { ...currentPlayerHealth, current: nextPlayerHealth } };
        const updated = { ...character, survival };
        const combatMessage = !hit
          ? `사냥 숙련 부족으로 공격이 빗나갔습니다. (성공률 ${Math.round((skillResult?.chance ?? 1) * 100)}%)`
          : defeated ? `${species}을(를) 쓰러뜨렸습니다.`
            : bowEquipped ? `화살이 명중해 ${damage}의 피해를 입혔습니다.`
              : `${species}에게 ${damage}의 피해를 입혔습니다.`;
        const lastOutcome: ActionOutcome | null = skillResult && skill ? { success: hit, chance: skillResult.chance, skillId: skill.id, gain: skillResult.gain, drained: skillResult.drained } : null;
        setState((current) => ({ ...current, selectedCharacter: updated, characters: current.characters.map((candidate) => candidate.id === updated.id ? updated : candidate), message: combatMessage, lastOutcome }));
        void updateDoc(doc(firestore, "characters", character.id), { survival, updatedAt: serverTimestamp() });
        const reward = defeated ? { ...profile.reward, quantity: calculateSkillYield(profile.reward.quantity, skillValue, 50) } : null;
        window.dispatchEvent(new CustomEvent("eldoria:world-action", { detail: {
          objectId,
          actionId,
          success: hit,
          target: { health: nextHealth, maximumHealth: profile.health, defeated },
          reward,
          combat: canCounter ? { counterDamage: profile.retaliation, playerDefeated } : null,
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
      const handleSleep = () => {
        const character = stateRef.current.selectedCharacter;
        if (!character) return;
        const health = character.survival.health ?? { current: 100, maximum: 100 };
        const survival = { ...character.survival, health: { ...health, current: health.maximum } };
        const updated = { ...character, survival };
        setState((current) => ({ ...current, selectedCharacter: updated, characters: current.characters.map((candidate) => candidate.id === updated.id ? updated : candidate), message: "통나무 집에서 잠을 자고 몸을 회복했습니다." }));
        void updateDoc(doc(firestore, "characters", character.id), { survival, updatedAt: serverTimestamp() });
      };
      const handleLocalResource = (event: Event) => {
        const objectId = (event as CustomEvent<{ objectId: string }>).detail?.objectId;
        const character = stateRef.current.selectedCharacter;
        if (!objectId || !character) return;
        const object = getZoneDefinition(character.position.zoneId)?.layers.objects.find((candidate) => candidate.id === objectId);
        if (!object || isWildlifeType(object.type)) return;
        if (Math.hypot(character.position.x - object.x, character.position.y - object.y) > 260) return;
        if (object.type === "animalDenEntrance" || object.type === "animalDenExit") {
          const returnKey = `eldoria.den-return.${character.id}`;
          let nextPosition = { zoneId: "untamedWilds", x: 385, y: 300 };
          if (object.type === "animalDenEntrance") {
            localStorage.setItem(returnKey, JSON.stringify(character.position));
            const arrival = getZoneDefinition("animalDen")?.layers.spawn.find((spawn) => spawn.id === "arrival");
            nextPosition = { zoneId: "animalDen", x: arrival?.x ?? 836, y: arrival?.y ?? 790 };
          } else {
            try {
              const saved = JSON.parse(localStorage.getItem(returnKey) ?? "null") as typeof nextPosition | null;
              if (saved?.zoneId === "untamedWilds" && Number.isFinite(saved.x) && Number.isFinite(saved.y)) nextPosition = saved;
            } catch {
              // Return to the safe ground outside the entrance if the local checkpoint is malformed.
            }
            localStorage.removeItem(returnKey);
          }
          const updated = { ...character, position: nextPosition };
          writeLocalPosition(user.uid, character.id, nextPosition);
          setState((current) => ({ ...current, selectedCharacter: updated, characters: current.characters.map((candidate) => candidate.id === updated.id ? updated : candidate), message: object.type === "animalDenEntrance" ? "동물 굴 안으로 들어갔습니다." : "동물 굴 밖으로 나왔습니다." }));
          void updateDoc(doc(firestore, "characters", character.id), { position: nextPosition, positionUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() });
          window.dispatchEvent(new CustomEvent("eldoria:zone-change", { detail: nextPosition.zoneId }));
          window.dispatchEvent(new CustomEvent("eldoria:player-state", { detail: nextPosition }));
          return;
        }
        const equipped = character.survival.equipment?.mainHand ?? character.survival.equipped ?? null;
        const isAxe = Boolean(equipped && (equipped === "tool.hand-axe" || equipped.endsWith("-axe")));
        const isPickaxe = Boolean(equipped && (equipped === "tool.pickaxe" || equipped.endsWith("-pickaxe")));
        let actionId = "";
        let reward: { itemId: string; quantity: number } | null = null;
        let message = "이 대상은 아직 사용할 수 없습니다.";
        if (object.type === "fishingWater" || object.type === "riverFishingWater") {
          const fishingRodEquipped = Boolean(equipped && (equipped === "tool.fishing-rod" || equipped.endsWith("-fishing-rod")));
          if (!fishingRodEquipped) { setState((current) => ({ ...current, message: "낚시하려면 낚싯대를 주손에 장착해야 합니다." })); return; }
          const regionalFish = getZoneDefinition(character.position.zoneId)?.ecology.hydrology.fishHabitats.filter((itemId) => itemId.startsWith("fish.")) ?? [];
          const itemId = regionalFish[Math.floor(Math.random() * regionalFish.length)] ?? pondFish[Math.floor(Math.random() * pondFish.length)]!.itemId;
          const caught = foodCatalog.find((food) => food.id === itemId);
          actionId = "fishing.cast"; reward = { itemId, quantity: 1 }; message = `${object.type === "riverFishingWater" ? "강" : "연못"}에서 ${caught?.name.ko ?? itemId}를 낚았습니다.`;
        } else if (object.type === "wildTree") {
          if (!isAxe) { setState((current) => ({ ...current, message: "나무를 베려면 도끼가 필요합니다." })); return; }
          actionId = "material.process"; reward = { itemId: "wood.raw-log", quantity: 1 }; message = "나무에서 통나무를 얻었습니다.";
        } else if (object.type === "wildFruitTree") {
          actionId = "fruit.gather"; reward = { itemId: "fruit.apple", quantity: 1 }; message = "잘 익은 사과를 땄습니다.";
        } else if (object.type === "looseStone") {
          actionId = "stone.flake"; reward = { itemId: "stone.raw", quantity: 1 }; message = "돌덩이를 주웠습니다.";
        } else if (object.type === "fallenBranch") {
          actionId = "material.process"; reward = { itemId: "wood.branch", quantity: 1 }; message = "나뭇가지를 주웠습니다.";
        } else if (object.type === "stoneOutcrop" || object.type.endsWith("OreDeposit") || object.type === "coalDeposit") {
          if (!isPickaxe) {
            const message = object.type === "stoneOutcrop"
              ? "암반을 캐려면 곡괭이가 필요합니다."
              : "광석을 캐려면 곡괭이가 필요합니다.";
            setState((current) => ({ ...current, message }));
            return;
          }
          const nodeKey = `${character.position.zoneId}:${object.id}`;
          const now = Date.now();
          const storedNode = localResourceStateRef.current.get(nodeKey);
          const node = !storedNode || (storedNode.exhaustedUntil > 0 && storedNode.exhaustedUntil <= now)
            ? { remaining: 12, exhaustedUntil: 0 }
            : storedNode;
          if (node.exhaustedUntil > now || node.remaining <= 0) {
            setState((current) => ({ ...current, message: "이 광맥은 고갈되었습니다. 잠시 후 다시 채굴할 수 있습니다." }));
            window.dispatchEvent(new CustomEvent<WorldObjectState>("eldoria:world-object", { detail: { kind: "resource", zoneId: character.position.zoneId, objectId, remaining: 0, maximum: 12, exhaustedUntil: node.exhaustedUntil } }));
            return;
          }
          actionId = "ore.mine"; reward = { itemId: "stone.raw", quantity: 1 }; message = "광맥에서 돌을 캐냈습니다.";
        }
        if (!actionId || !reward) return;
        const skill = findSkillForAction(actionId);
        const skillValue = skill ? character.survival.skills?.[skill.id]?.value ?? 0 : 0;
        let skillResult: ReturnType<typeof resolveSkillAction> | undefined;
        if (skill) {
          const successFloor = object.type === "looseStone" || object.type === "fallenBranch" ? 1
            : object.type === "wildFruitTree" ? 0.8
              : object.type === "fishingWater" || object.type === "riverFishingWater" ? 0.55
                : object.type === "wildTree" ? 0.45
                  : 0.65;
          skillResult = resolveSkillAction({
            skill,
            skills: character.survival.skills ?? {},
            locks: character.survival.locks ?? {},
            roll: Math.random(),
            successFloor,
          });
        }
        let survival = { ...character.survival, skills: skillResult?.skills ?? character.survival.skills };
        if (skillResult && !skillResult.success) {
          const failureMessage = `${skill?.name.ko ?? "관련 기술"} 숙련이 부족해 작업에 실패했습니다. (성공률 ${Math.round(skillResult.chance * 100)}%)`;
          const updated = { ...character, survival };
          const lastOutcome: ActionOutcome = { success: false, chance: skillResult.chance, skillId: skill!.id, gain: skillResult.gain, drained: skillResult.drained };
          setState((current) => ({ ...current, selectedCharacter: updated, characters: current.characters.map((candidate) => candidate.id === updated.id ? updated : candidate), message: failureMessage, lastOutcome }));
          void updateDoc(doc(firestore, "characters", character.id), { survival, updatedAt: serverTimestamp() });
          window.dispatchEvent(new CustomEvent("eldoria:world-action", { detail: { objectId, actionId, success: false, target: null, reward: null, combat: null } }));
          return;
        }
        const skillTier = actionId === "material.process" && object.type === "wildTree" ? 30 : 40;
        reward.quantity = actionId === "ore.mine"
          ? calculateMiningYield(equipped, skillValue)
          : calculateSkillYield(reward.quantity, skillValue, skillTier);
        if (actionId === "ore.mine") message = `광맥에서 돌 ${reward.quantity}개를 캐냈습니다.`;
        else if (reward.quantity > 1) message = `${message.replace(/\.$/, "")} ${reward.quantity}개를 얻었습니다.`;
        const inventory = (character.survival.inventory ?? []).map((stack) => ({ ...stack }));
        const stack = inventory.find((candidate) => candidate.itemId === reward.itemId);
        if (stack) stack.quantity += reward.quantity; else inventory.push({ ...reward });
        survival = { ...survival, inventory };
        const updated = { ...character, survival };
        const lastOutcome: ActionOutcome | null = skillResult && skill ? { success: true, chance: skillResult.chance, skillId: skill.id, gain: skillResult.gain, drained: skillResult.drained } : null;
        setState((current) => ({ ...current, selectedCharacter: updated, characters: current.characters.map((candidate) => candidate.id === updated.id ? updated : candidate), message, lastOutcome }));
        void updateDoc(doc(firestore, "characters", character.id), { survival, updatedAt: serverTimestamp() });
        window.dispatchEvent(new CustomEvent("eldoria:world-action", { detail: { objectId, actionId, success: true, target: null, reward, combat: null } }));
        if (actionId === "ore.mine") {
          const nodeKey = `${character.position.zoneId}:${objectId}`;
          const previous = localResourceStateRef.current.get(nodeKey) ?? { remaining: 12, exhaustedUntil: 0 };
          const remaining = Math.max(0, previous.remaining - 1);
          const exhaustedUntil = remaining === 0 ? Date.now() + 300_000 : 0;
          localResourceStateRef.current.set(nodeKey, { remaining, exhaustedUntil });
          window.dispatchEvent(new CustomEvent<WorldObjectState>("eldoria:world-object", { detail: { kind: "resource", zoneId: character.position.zoneId, objectId, remaining, maximum: 12, exhaustedUntil } }));
        }
      };
      const handleWildlifeAggression = (event: Event) => {
        const objectId = (event as CustomEvent<{ objectId: string }>).detail?.objectId;
        const character = stateRef.current.selectedCharacter;
        if (!objectId || !character) return;
        const object = getZoneDefinition(character.position.zoneId)?.layers.objects.find((candidate) => candidate.id === objectId);
        if (!object?.type.startsWith("wildlifeSpawn")) return;
        const species = object.type.slice("wildlifeSpawn".length);
        const profile = localWildlifeCombat[species];
        if (!profile || !["Wolf", "Bear", "Boar"].includes(species)) return;
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
      const handleStructurePlacement = (event: Event) => {
        const detail = (event as CustomEvent<{ id: string; zoneId: string; x: number; y: number }>).detail;
        const character = stateRef.current.selectedCharacter;
        if (!detail || !character) return;
        const structures = (character.survival.structures ?? []).map((structure) => structure.id === detail.id
          ? { ...structure, zoneId: detail.zoneId, x: detail.x, y: detail.y }
          : structure);
        if (!structures.some((structure) => structure.id === detail.id)) return;
        const survival = { ...character.survival, structures };
        const updated = { ...character, survival };
        setState((current) => ({ ...current, selectedCharacter: updated, characters: current.characters.map((candidate) => candidate.id === updated.id ? updated : candidate), message: "통나무 집을 배치했습니다." }));
        void updateDoc(doc(firestore, "characters", character.id), { survival, updatedAt: serverTimestamp() });
        window.dispatchEvent(new CustomEvent("eldoria:structures", { detail: structures }));
      };
      const handleMiningStatus = (event: Event) => {
        const message = (event as CustomEvent<string>).detail;
        if (message) setState((current) => ({ ...current, message }));
      };
      const stopAutomaticMining = () => {
        if (miningInterval !== undefined) window.clearInterval(miningInterval);
        miningInterval = undefined;
      };
      const handleMiningStart = (event: Event) => {
        const detail = (event as CustomEvent<{ objectId: string; intervalMs?: number }>).detail;
        if (!detail?.objectId) return;
        stopAutomaticMining();
        miningInterval = window.setInterval(() => {
          const character = stateRef.current.selectedCharacter;
          const equipped = character?.survival.equipment?.mainHand ?? character?.survival.equipped ?? "";
          if (equipped !== "tool.pickaxe" && !equipped.endsWith("-pickaxe")) {
            stopAutomaticMining();
            return;
          }
          handleLocalResource(new CustomEvent("eldoria:interact", { detail: { objectId: detail.objectId } }));
        }, Math.max(500, detail.intervalMs ?? 1900));
      };
      window.addEventListener("eldoria:player-state", persistPosition);
      window.addEventListener("eldoria:interact", handleWildlifeCombat);
      window.addEventListener("eldoria:interact", handleLocalResource);
      window.addEventListener("eldoria:wildlife-aggression", handleWildlifeAggression);
      window.addEventListener("eldoria:loot", handleLoot);
      window.addEventListener("eldoria:sleep", handleSleep);
      window.addEventListener("eldoria:structure-place", handleStructurePlacement);
      window.addEventListener("eldoria:mining-status", handleMiningStatus);
      window.addEventListener("eldoria:mining-start", handleMiningStart);
      window.addEventListener("eldoria:mining-stop", stopAutomaticMining);
      void getDocs(query(collection(firestore, "characters"), where("ownerUid", "==", user.uid))).then((snapshot) => {
        if (cancelled) return;
        const characters = snapshot.docs.map((document) => {
          const data = document.data();
          const createdAt = typeof data.createdAt?.toDate === "function" ? data.createdAt.toDate().toISOString() : new Date().toISOString();
          const databasePosition = data.position && typeof data.position.x === "number" ? data.position as CharacterSummary["position"] : { zoneId: "untamedWilds", x: 836, y: 470 };
          // Inventory, combat and sleep also update the character document. Only a position-specific
          // timestamp can tell whether the DB coordinate is newer than the synchronous checkpoint.
          const databasePositionUpdatedAt = typeof data.positionUpdatedAt?.toMillis === "function" ? data.positionUpdatedAt.toMillis() : 0;
          const checkpoint = readLocalPosition(user.uid, document.id);
          const position = checkpoint && checkpoint.savedAt > databasePositionUpdatedAt ? checkpoint.position : databasePosition;
          if (checkpoint && checkpoint.savedAt > databasePositionUpdatedAt) void updateDoc(doc(firestore, "characters", document.id), { position, positionUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() });
          return {
            id: document.id,
            name: String(data.name ?? "Wanderer"),
            gender: data.gender === "female" ? "female" as const : "male" as const,
            position,
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
        stopAutomaticMining();
        // A reload can happen inside the one-second debounce window. Flush that last coordinate so
        // the same character resumes at the exact place they stopped instead of an older checkpoint.
        const characterId = selectedCharacterIdRef.current;
        if (pendingPosition && characterId) void updateDoc(doc(firestore, "characters", characterId), { position: pendingPosition, positionUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        window.removeEventListener("eldoria:player-state", persistPosition);
        window.removeEventListener("eldoria:interact", handleWildlifeCombat);
        window.removeEventListener("eldoria:interact", handleLocalResource);
        window.removeEventListener("eldoria:wildlife-aggression", handleWildlifeAggression);
        window.removeEventListener("eldoria:loot", handleLoot);
        window.removeEventListener("eldoria:sleep", handleSleep);
        window.removeEventListener("eldoria:structure-place", handleStructurePlacement);
        window.removeEventListener("eldoria:mining-status", handleMiningStatus);
        window.removeEventListener("eldoria:mining-start", handleMiningStart);
        window.removeEventListener("eldoria:mining-stop", stopAutomaticMining);
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
      void addDoc(collection(firestore, "characters"), { ownerUid: user.uid, name: name.trim(), gender, position: { zoneId: "untamedWilds", x: 836, y: 470 }, positionUpdatedAt: serverTimestamp(), survival, startVersion: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }).then((reference) => {
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
    craft: (recipeId) => {
      if (!firebaseMode) return sendCharacterCommand({ type: "craft.attempt", requestId: crypto.randomUUID(), payload: { recipeId } });
      const character = state.selectedCharacter;
      const recipe = craftingRecipes.find((candidate) => candidate.id === recipeId);
      if (!character || !recipe) return;
      const inventory = (character.survival.inventory ?? []).map((stack) => ({ ...stack }));
      const missing = recipe.inputs.find((input) => (inventory.find((stack) => stack.itemId === input.itemId)?.quantity ?? 0) < input.quantity);
      if (missing) {
        const message = `${missing.itemId} 재료가 부족합니다.`;
        setState((current) => ({ ...current, message, lastCraft: { recipeId, success: false, message, chance: null } }));
        return;
      }
      const skill = findSkillForAction(recipe.actionId);
      const skillResult = skill ? resolveSkillAction({
        skill,
        skills: character.survival.skills ?? {},
        locks: character.survival.locks ?? {},
        roll: Math.random(),
        difficulty: recipe.difficulty,
        successFloor: recipe.successFloor,
      }) : undefined;
      const crafted = skillResult?.success ?? true;
      for (const input of recipe.inputs) {
        const stack = inventory.find((candidate) => candidate.itemId === input.itemId)!;
        stack.quantity -= crafted ? input.quantity : Math.max(1, Math.floor(input.quantity / 2));
      }
      const remaining = inventory.filter((stack) => stack.quantity > 0);
      let structures = character.survival.structures ?? [];
      let built: BuiltStructure | undefined;
      if (crafted && (recipe.output.itemId === "structure.log-shelter" || recipe.output.itemId === "structure.wood-bridge")) {
        // Negative coordinates represent a crafted but not yet placed structure. The scene presents a
        // placement preview and persists the chosen clear ground through eldoria:structure-place.
        built = { id: crypto.randomUUID(), type: recipe.output.itemId === "structure.wood-bridge" ? "wood-bridge" : "log-shelter", zoneId: character.position.zoneId, x: -1, y: -1 };
        structures = [...structures, built];
      } else if (crafted) {
        const output = remaining.find((stack) => stack.itemId === recipe.output.itemId);
        if (output) output.quantity += recipe.output.quantity;
        else remaining.push({ ...recipe.output });
      }
      const survival = { ...character.survival, inventory: remaining, structures, skills: skillResult?.skills ?? character.survival.skills };
      const updated = { ...character, survival };
      const chance = skillResult?.chance ?? 1;
      const message = !crafted
        ? `${skill?.name.ko ?? "제작"} 숙련 부족으로 ${recipe.name.ko} 제작에 실패했습니다. 재료 일부를 잃었습니다. (성공률 ${Math.round(chance * 100)}%)`
        : built ? `${recipe.name.ko} 제작을 완료했습니다. 월드의 원하는 위치를 클릭해 배치하세요.`
          : `${recipe.name.ko} 제작을 완료했습니다.`;
      setState((current) => ({ ...current, selectedCharacter: updated, characters: current.characters.map((candidate) => candidate.id === updated.id ? updated : candidate), message, lastCraft: { recipeId, success: crafted, message, chance } }));
      void updateDoc(doc(firestore, "characters", character.id), { survival, updatedAt: serverTimestamp() }).catch((error: unknown) => setState((current) => ({ ...current, message: error instanceof Error ? error.message : String(error) })));
      if (built) window.dispatchEvent(new CustomEvent("eldoria:structures", { detail: structures }));
    },
  };
}
