import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { decodeClientMessage, encodeMessage, type ActionOutcome, type CharacterSummary, type CombatState, type TargetState, type WorldObjectState } from "@eldoria/game-protocol";
import { MAXIMUM_HEALTH, calculateMiningYield, calculateSkillDamage, calculateSkillInterval, calculateSkillYield, createInitialSurvivalState, defaultSkillProgression, findRecipe, findTool, foodCatalog, getZoneDefinition, isEquipmentSlot, nutrientIds, resolveSkillAction, type ToolDefinition } from "@eldoria/game-data";
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
  const nodeStates = new Map<string, { remaining: number; exhaustedUntil: number }>();
  const denReturnPositions = new Map<string, { zoneId: string; x: number; y: number }>();
  const httpServer: HttpServer = createServer((request, response) => {
    void handleHttpRequest(request, response, dependencies.verifyIdToken, skills);
  });

  const webSocketServer = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 });
  const broadcastObjectState = (object: WorldObjectState) => {
    const message = encodeMessage({ type: "world.object", requestId: `object-${object.objectId}-${Date.now()}`, payload: { object } });
    for (const client of webSocketServer.clients) if (client.readyState === client.OPEN) client.send(message);
  };
  const snapshotForZone = (zoneId: string): WorldObjectState[] => {
    const now = Date.now();
    const zone = getZoneDefinition(zoneId);
    if (!zone) return [];
    return zone.layers.objects.flatMap((object): WorldObjectState[] => {
      const yields = NODE_YIELDS[object.type];
      if (yields) {
        const key = `${zoneId}:${object.id}`;
        const stored = nodeStates.get(key);
        if (stored?.exhaustedUntil && stored.exhaustedUntil <= now) nodeStates.delete(key);
        const state = nodeStates.get(key) ?? { remaining: yields.charges, exhaustedUntil: 0 };
        return [{ kind: "resource", zoneId, objectId: object.id, remaining: state.exhaustedUntil > now ? 0 : state.remaining, maximum: yields.charges, exhaustedUntil: state.exhaustedUntil }];
      }
      if (isWildlifeType(object.type)) {
        const species = wildlifeSpecies(object.type);
        const maximumHealth = WILDLIFE[species].maximumHealth;
        const state = wildlifeStates.get(`${zoneId}:${object.id}`) ?? { health: maximumHealth, defeatedUntil: 0 };
        return [{ kind: "wildlife", zoneId, objectId: object.id, health: state.defeatedUntil > now ? 0 : state.health, maximumHealth, defeatedUntil: state.defeatedUntil }];
      }
      return [];
    });
  };
  webSocketServer.on("connection", (socket, request) => {
    let uid: string | null = null;
    let selectedCharacterId: string | null = null;
    // Cached so a strike can be priced without another round trip to storage mid-swing.
    let equippedItem: string | null = null;
    // Mirrors the stored wear so a strike can be priced before the character record is loaded.
    let survivalWear: Record<string, number> = {};
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
        equippedItem = character.survival?.equipment?.mainHand ?? character.survival?.equipped ?? null;
        survivalWear = { ...(character.survival?.toolWear ?? {}) };
        socket.send(encodeMessage({ type: "character.selected", requestId: message.requestId, payload: { character } }));
        socket.send(encodeMessage({ type: "world.snapshot", requestId: message.requestId, payload: { zoneId: character.position.zoneId, objects: snapshotForZone(character.position.zoneId) } }));
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
      } else if (message.type === "world.observe") {
        const player = uid ? world.get(uid) : undefined;
        if (!uid || !selectedCharacterId || !player || player.position.zoneId !== message.payload.zoneId) {
          sendError(socket, message.requestId, "world.unavailable", "Select a character in that zone before observing it.");
          return;
        }
        socket.send(encodeMessage({ type: "world.snapshot", requestId: message.requestId, payload: { zoneId: message.payload.zoneId, objects: snapshotForZone(message.payload.zoneId) } }));
      } else if (message.type === "world.interact") {
        if (!uid || !selectedCharacterId) {
          sendError(socket, message.requestId, "character.required", "Select a character before interacting.");
          return;
        }
        const player = world.get(uid);
        const object = player ? getZoneDefinition(player.position.zoneId)?.layers.objects.find((candidate) => candidate.id === message.payload.objectId) : undefined;
        // The server bound is an anti-cheat ceiling, not the feel of the fight; the client closes to
        // arm's length before it swings. 600 was wide enough to hit across most of a screen.
        // The client only emits melee attacks at 68px; this wider server ceiling absorbs network
        // position lag without making a distant attack possible through the normal game controls.
        const interactionRange = object?.type.startsWith("ambientBirdFlock") ? 520 : object?.type.startsWith("wildlifeSpawn") ? 300 : 260;
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
          if (moved) {
            socket.send(encodeMessage({ type: "world.action", requestId: message.requestId, payload: { objectId: object.id, actionId: "travel.enter", message: object.type === "animalDenEntrance" ? "Entered the wild animal den." : "Returned to the untamed wilds." } }));
            socket.send(encodeMessage({ type: "world.snapshot", requestId: message.requestId, payload: { zoneId: moved.position.zoneId, objects: snapshotForZone(moved.position.zoneId) } }));
          }
          return;
        }
        let action = resolveResourceAction(object.type, object.id, player.position.zoneId, equippedItem);
        let quarry: { key: string; state: { health: number; defeatedUntil: number }; species: keyof typeof WILDLIFE; maximumHealth: number } | null = null;
        const flyingBird = object.type.startsWith("ambientBirdFlock");
        if (flyingBird && !equippedItem?.endsWith("-bow")) {
          sendError(socket, message.requestId, "interaction.needs_bow", "Flying birds must be hunted with a bow and arrow.");
          return;
        }
        if (isWildlifeType(object.type)) {
          const species = wildlifeSpecies(object.type);
          const quarryProfile = WILDLIFE[species];
          const maximumHealth = quarryProfile.maximumHealth;
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
          quarry = { key: wildlifeKey, state, species, maximumHealth };
          const inHand = findTool(equippedItem ?? "");
          const sharpness = toolCondition(inHand, survivalWear);
          action = { actionId: flyingBird ? "bow.shot" : "club.strike", difficulty: Math.max(0, quarryProfile.barehandedDifficulty - Math.round((inHand?.huntingBonus ?? 0) * sharpness)), successFloor: quarryProfile.barehandedFloor, message: "", failureMessage: `The ${species} slipped away from the blow.`, cooldownMs: 700 };
        }
        if (!action) {
          sendError(socket, message.requestId, "interaction.unavailable", "This object cannot be used yet.");
          return;
        }
        // A node is spent by its charges, not by the cooldown: the cooldown only paces the swings.
        const yields = NODE_YIELDS[object.type];
        const nodeKey = `${player.position.zoneId}:${object.id}`;
        let node = yields ? nodeStates.get(nodeKey) ?? { remaining: yields.charges, exhaustedUntil: 0 } : undefined;
        if (yields && node) {
          if (node.exhaustedUntil > Date.now()) {
            const seconds = Math.ceil((node.exhaustedUntil - Date.now()) / 1000);
            sendError(socket, message.requestId, "resource.exhausted", `Nothing left here. It will come back in about ${seconds}s.`);
            return;
          }
          if (node.exhaustedUntil > 0) node = { remaining: yields.charges, exhaustedUntil: 0 };
        }
        if (action.requiresTool && !action.requiresTool.includes(equippedItem ?? "")) {
          const needed = action.requiresTool.map((itemId) => findTool(itemId)?.name.en ?? itemId).join(" or ");
          sendError(socket, message.requestId, "interaction.needs_tool", `You need a ${needed} in hand for that.`);
          return;
        }
        const cooldownKey = `${uid}:${object.id}`;
        const now = Date.now();
        if ((interactionCooldowns.get(cooldownKey) ?? 0) > now) {
          sendError(socket, message.requestId, "interaction.cooldown", "Wait before using this resource again.");
          return;
        }
        const character = await dependencies.characters.getOwned(uid, selectedCharacterId);
        if (!character) {
          sendError(socket, message.requestId, "character.not_found", "Character was not found.");
          return;
        }
        const survival = structuredClone(character.survival ?? createInitialSurvivalState());
        survival.inventory ??= [];
        survival.skills ??= {};
        survival.locks ??= {};
        if (flyingBird) {
          const arrows = survival.inventory.find((stack) => stack.itemId === "ammunition.arrow");
          if (!arrows || arrows.quantity < 1) {
            sendError(socket, message.requestId, "interaction.needs_arrow", "Craft an arrow before hunting a flying bird.");
            return;
          }
          arrows.quantity -= 1;
          survival.inventory = survival.inventory.filter((stack) => stack.quantity > 0);
        }

        // GDD section 6: skill decides the odds, never the permission. A failure costs time and the reward only.
        const skillConfig = (await skills.list()).find((candidate) => candidate.actionIds.includes(action.actionId));
        let outcome: ActionOutcome | undefined;
        let succeeded = true;
        let skillValue = 0;
        if (skillConfig) {
          skillValue = survival.skills[skillConfig.id]?.value ?? 0;
          const result = resolveSkillAction({ skill: skillConfig, skills: survival.skills, locks: survival.locks, roll: Math.random(), difficulty: action.difficulty, successFloor: action.successFloor });
          survival.skills = result.skills;
          succeeded = result.success;
          outcome = { success: result.success, chance: result.chance, skillId: skillConfig.id, gain: result.gain, drained: result.drained };
        }
        const skilledCooldown = calculateSkillInterval(action.cooldownMs, skillValue);
        interactionCooldowns.set(cooldownKey, now + Math.round(skilledCooldown * (succeeded ? 1 : FAILURE_COOLDOWN_MULTIPLIER)));

        let reward = succeeded ? scaleReward(action, skillValue) : undefined;
        let resultMessage = succeeded ? action.message : action.failureMessage;
        let target: TargetState | undefined;
        let combat: CombatState | undefined;
        let objectState: WorldObjectState | undefined;
        if (quarry) {
          let defeated = false;
          if (succeeded) {
            quarry.state.health -= strikeDamage(findTool(equippedItem ?? ""), survivalWear, skillValue);
            defeated = quarry.state.health <= 0;
            if (defeated) {
              quarry.state.health = quarry.maximumHealth;
              quarry.state.defeatedUntil = now + 45_000;
              reward = { itemId: WILDLIFE[quarry.species].rewardItem, quantity: calculateSkillYield(WILDLIFE[quarry.species].yield, skillValue, 50) };
            }
            resultMessage = defeated ? `Caught the ${quarry.species}.` : flyingBird ? `The arrow hit the ${quarry.species}. ${quarry.state.health} health remains.` : `Struck the ${quarry.species} with bare fists. ${quarry.state.health} health remains.`;
          }
          wildlifeStates.set(quarry.key, quarry.state);
          target = { health: defeated ? 0 : quarry.state.health, maximumHealth: quarry.maximumHealth, defeated };
          // A cornered animal answers back. Nothing here flees: the exchange runs both ways until
          // one of them is down, which is what makes a weapon worth the Toolmaking it costs.
          const counter = WILDLIFE[quarry.species];
          if (!defeated && Math.random() < counter.retaliationChance) {
            survival.health ??= { current: MAXIMUM_HEALTH, maximum: MAXIMUM_HEALTH };
            const bite = counter.retaliation;
            combat = { counterDamage: bite, playerDefeated: false };
            survival.health.current = Math.max(0, survival.health.current - bite);
            resultMessage = `${resultMessage} The ${quarry.species} strikes back for ${bite}.`;
            if (survival.health.current <= 0) {
              // Death handling is an open GDD question (section 14), so for now the wanderer wakes at
              // the arrival spawn, whole, with everything they were carrying.
              survival.health.current = survival.health.maximum;
              combat.playerDefeated = true;
              world.teleport(uid, player.position.zoneId, "arrival") ?? world.place(uid, player.position);
              resultMessage = `The ${quarry.species} put you down. You wake at the arrival stones.`;
              quarry.state.health = quarry.maximumHealth;
              wildlifeStates.set(quarry.key, quarry.state);
              target = { health: quarry.maximumHealth, maximumHealth: quarry.maximumHealth, defeated: false };
            }
          }
          objectState = { kind: "wildlife", zoneId: player.position.zoneId, objectId: object.id, health: quarry.state.defeatedUntil > now ? 0 : quarry.state.health, maximumHealth: quarry.maximumHealth, defeatedUntil: quarry.state.defeatedUntil };
        }
        // The failure penalty is time: the resource stays out of reach for longer than a clean attempt would cost.
        // A tool wears with use and finally breaks. Wear is only spent on work that landed.
        const wielded = equippedItem ? findTool(equippedItem) : undefined;
        if (succeeded && wielded) {
          survival.toolWear ??= {};
          const used = (survival.toolWear[wielded.itemId] ?? 0) + 1;
          if (used >= wielded.durability) {
            delete survival.toolWear[wielded.itemId];
            const stack = survival.inventory.find((item) => item.itemId === wielded.itemId);
            if (stack) stack.quantity -= 1;
            survival.inventory = survival.inventory.filter((item) => item.quantity > 0);
            if (!survival.inventory.some((item) => item.itemId === wielded.itemId)) {
              survival.equipment = { ...survival.equipment, [wielded.slot]: null };
              if (wielded.slot === "mainHand") survival.equipped = null;
              equippedItem = null;
            }
            resultMessage = `${resultMessage} Your ${wielded.name.en.toLowerCase()} broke.`;
          } else {
            survival.toolWear[wielded.itemId] = used;
          }
          survivalWear = { ...survival.toolWear };
        }
        if (reward && yields && node) {
          node.remaining -= 1;
          if (node.remaining <= 0) {
            node.remaining = yields.charges;
            node.exhaustedUntil = now + yields.respawnMs;
            resultMessage = `${resultMessage} That is the last of it here.`;
          }
          nodeStates.set(nodeKey, node);
          objectState = { kind: "resource", zoneId: player.position.zoneId, objectId: object.id, remaining: node.exhaustedUntil > now ? 0 : node.remaining, maximum: yields.charges, exhaustedUntil: node.exhaustedUntil };
        }
        if (reward) {
          const stack = survival.inventory.find((item) => item.itemId === reward.itemId);
          if (stack) stack.quantity += reward.quantity;
          else survival.inventory.push({ ...reward });
        }
        await dependencies.characters.saveSurvival(uid, selectedCharacterId, survival);
        socket.send(encodeMessage({ type: "world.action", requestId: message.requestId, payload: { objectId: object.id, actionId: action.actionId, message: resultMessage, ...(reward ? { reward } : {}), survival, ...(outcome ? { outcome } : {}), ...(target ? { target } : {}), ...(combat ? { combat } : {}) } }));
        if (objectState) broadcastObjectState(objectState);
      } else if (message.type === "item.equip") {
        if (!uid || !selectedCharacterId) {
          sendError(socket, message.requestId, "character.required", "Select a character before equipping.");
          return;
        }
        const equipTool = message.payload.itemId === null ? undefined : findTool(message.payload.itemId);
        if (message.payload.itemId !== null && !equipTool) {
          sendError(socket, message.requestId, "item.not_a_tool", "That is not something you can wear or wield.");
          return;
        }
        // The slot comes from the item itself; a client may name one only to clear it.
        const slot = equipTool?.slot ?? (isEquipmentSlot(message.payload.slot) ? message.payload.slot : "mainHand");
        const character = await dependencies.characters.getOwned(uid, selectedCharacterId);
        if (!character) {
          sendError(socket, message.requestId, "character.not_found", "Character was not found.");
          return;
        }
        const survival = structuredClone(character.survival ?? createInitialSurvivalState());
        survival.inventory ??= [];
        if (message.payload.itemId !== null && !survival.inventory.some((item) => item.itemId === message.payload.itemId && item.quantity > 0)) {
          sendError(socket, message.requestId, "item.missing", "You are not carrying that.");
          return;
        }
        survival.equipment = { ...survival.equipment, [slot]: message.payload.itemId };
        // Kept in step so characters saved before the rig existed keep working.
        if (slot === "mainHand") survival.equipped = message.payload.itemId;
        equippedItem = survival.equipment.mainHand ?? null;
        survivalWear = { ...(survival.toolWear ?? {}) };
        await dependencies.characters.saveSurvival(uid, selectedCharacterId, survival);
        socket.send(encodeMessage({ type: "item.equipped", requestId: message.requestId, payload: { itemId: message.payload.itemId, slot, survival } }));
      } else if (message.type === "craft.attempt") {
        if (!uid || !selectedCharacterId) {
          sendError(socket, message.requestId, "character.required", "Select a character before crafting.");
          return;
        }
        const recipe = findRecipe(message.payload.recipeId);
        if (!recipe) {
          sendError(socket, message.requestId, "recipe.not_found", "No such recipe.");
          return;
        }
        const character = await dependencies.characters.getOwned(uid, selectedCharacterId);
        if (!character) {
          sendError(socket, message.requestId, "character.not_found", "Character was not found.");
          return;
        }
        const survival = structuredClone(character.survival ?? createInitialSurvivalState());
        survival.inventory ??= [];
        survival.skills ??= {};
        survival.locks ??= {};
        const missing = recipe.inputs.find((input) => (survival.inventory!.find((item) => item.itemId === input.itemId)?.quantity ?? 0) < input.quantity);
        if (missing) {
          sendError(socket, message.requestId, "craft.missing_materials", `Not enough ${missing.itemId}.`);
          return;
        }
        const skillConfig = (await skills.list()).find((candidate) => candidate.actionIds.includes(recipe.actionId));
        let crafted = true;
        let outcome: ActionOutcome | undefined;
        if (skillConfig) {
          const result = resolveSkillAction({ skill: skillConfig, skills: survival.skills, locks: survival.locks, roll: Math.random(), difficulty: recipe.difficulty, successFloor: recipe.successFloor });
          survival.skills = result.skills;
          crafted = result.success;
          outcome = { success: result.success, chance: result.chance, skillId: skillConfig.id, gain: result.gain, drained: result.drained };
        }

        // GDD section 6.2 prices a botch in *part* of the stock, not all of it: a spoiled piece is
        // salvaged for what it still is. A clean piece of work consumes what the recipe asks.
        const spoiled: string[] = [];
        for (const input of recipe.inputs) {
          const stack = survival.inventory.find((item) => item.itemId === input.itemId)!;
          const spent = crafted ? input.quantity : Math.max(1, Math.floor(input.quantity / 2));
          stack.quantity -= spent;
          if (!crafted) spoiled.push(`${input.itemId} ×${spent}`);
        }
        survival.inventory = survival.inventory.filter((item) => item.quantity > 0);
        if (crafted) {
          const stack = survival.inventory.find((item) => item.itemId === recipe.output.itemId);
          if (stack) stack.quantity += recipe.output.quantity;
          else survival.inventory.push({ ...recipe.output });
        }
        await dependencies.characters.saveSurvival(uid, selectedCharacterId, survival);
        socket.send(encodeMessage({
          type: "craft.result",
          requestId: message.requestId,
          payload: {
            recipeId: recipe.id,
            success: crafted,
            message: crafted ? `Made a ${recipe.name.en.toLowerCase()}. It is in your pack.` : `The ${recipe.name.en.toLowerCase()} broke in the making. Lost ${spoiled.join(", ")}.`,
            ...(outcome ? { outcome } : {}),
            survival,
          },
        }));
      } else if (message.type === "item.eat") {
        if (!uid || !selectedCharacterId) {
          sendError(socket, message.requestId, "character.required", "Select a character before eating.");
          return;
        }
        const food = foodCatalog.find((candidate) => candidate.id === message.payload.itemId);
        if (!food) {
          sendError(socket, message.requestId, "item.inedible", "That cannot be eaten.");
          return;
        }
        if (food.category !== "fruit") {
          sendError(socket, message.requestId, "item.needs_cooking", "Raw meat and fish must be cooked before eating.");
          return;
        }
        const character = await dependencies.characters.getOwned(uid, selectedCharacterId);
        if (!character) {
          sendError(socket, message.requestId, "character.not_found", "Character was not found.");
          return;
        }
        const survival = structuredClone(character.survival ?? createInitialSurvivalState());
        survival.inventory ??= [];
        const stack = survival.inventory.find((item) => item.itemId === food.id);
        if (!stack || stack.quantity < 1) {
          sendError(socket, message.requestId, "item.missing", "You are not carrying that.");
          return;
        }
        stack.quantity -= 1;
        if (stack.quantity <= 0) survival.inventory = survival.inventory.filter((item) => item.itemId !== food.id);
        // A body can only hold so much of any one nutrient; the surplus is simply passed.
        for (const nutrient of nutrientIds) {
          survival.nutrition[nutrient] = Math.min(NUTRITION_CEILING, survival.nutrition[nutrient] + food.nutrients[nutrient]);
        }
        // Nothing regenerates on its own out here — a meal is the only way back up, and a substantial
        // one mends more than a handful of berries does.
        survival.health ??= { current: MAXIMUM_HEALTH, maximum: MAXIMUM_HEALTH };
        const nourishment = food.nutrients.protein + food.nutrients.fat + food.nutrients.carbohydrate;
        const mended = Math.max(2, Math.round(nourishment * HEALTH_PER_NOURISHMENT));
        const before = survival.health.current;
        survival.health.current = Math.min(survival.health.maximum, survival.health.current + mended);
        const recovered = survival.health.current - before;
        await dependencies.characters.saveSurvival(uid, selectedCharacterId, survival);
        socket.send(encodeMessage({ type: "item.eaten", requestId: message.requestId, payload: { itemId: food.id, message: recovered > 0 ? `Ate the ${food.name.en.toLowerCase()}. Recovered ${recovered} health.` : `Ate the ${food.name.en.toLowerCase()}.`, survival } }));
      } else if (message.type === "skill.lock") {
        if (!uid || !selectedCharacterId) {
          sendError(socket, message.requestId, "character.required", "Select a character before changing skill locks.");
          return;
        }
        if (!defaultSkillProgression.some((candidate) => candidate.id === message.payload.skillId)) {
          sendError(socket, message.requestId, "skill.not_found", "Skill configuration was not found.");
          return;
        }
        const character = await dependencies.characters.getOwned(uid, selectedCharacterId);
        if (!character) {
          sendError(socket, message.requestId, "character.not_found", "Character was not found.");
          return;
        }
        const survival = structuredClone(character.survival ?? createInitialSurvivalState());
        survival.locks = { ...survival.locks, [message.payload.skillId]: message.payload.lock };
        await dependencies.characters.saveSurvival(uid, selectedCharacterId, survival);
        socket.send(encodeMessage({ type: "skill.locked", requestId: message.requestId, payload: { skillId: message.payload.skillId, lock: message.payload.lock, survival } }));
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

const FAILURE_COOLDOWN_MULTIPLIER = 1.6;
const NUTRITION_CEILING = 100;

/**
 * How much a node gives before it is spent, and how long the world takes to put it back. A branch
 * you picked up is gone; a rock face outlasts a season of chipping. Without this every node was an
 * infinite supply, which is not a resource — it is a button.
 */
const NODE_YIELDS: Record<string, { charges: number; respawnMs: number }> = {
  looseStone: { charges: 1, respawnMs: 150_000 },
  stoneOutcrop: { charges: 12, respawnMs: 300_000 },
  fallenBranch: { charges: 2, respawnMs: 150_000 },
  wildFruitTree: { charges: 6, respawnMs: 240_000 },
  wildTree: { charges: 4, respawnMs: 360_000 },
  copperOreDeposit: { charges: 8, respawnMs: 300_000 },
  coalDeposit: { charges: 8, respawnMs: 300_000 },
  ironOreDeposit: { charges: 8, respawnMs: 300_000 },
};
const HEALTH_PER_NOURISHMENT = 0.35;

function hashText(value: string) {
  let hash = 0;
  for (const character of value) hash = Math.imul(31, hash) + character.charCodeAt(0) | 0;
  return hash;
}

/**
 * GDD section 6 forbids locking an action behind a skill: anyone may try anything, and mastery only
 * moves the odds. So a stag is not off-limits to bare hands — it is simply a very poor idea, priced
 * through `barehandedDifficulty` on the Hunting curve until there is a weapon worth carrying.
 */
const WILDLIFE = {
  rabbit: { maximumHealth: 3, barehandedDifficulty: 10, barehandedFloor: 0.5, yield: 2, rewardItem: "meat.rabbit", retaliation: 1, retaliationChance: 1 },
  deer: { maximumHealth: 8, barehandedDifficulty: 55, barehandedFloor: 0.08, yield: 8, rewardItem: "meat.deer", retaliation: 5, retaliationChance: 1 },
  "wild-boar": { maximumHealth: 11, barehandedDifficulty: 70, barehandedFloor: 0.05, yield: 10, rewardItem: "meat.wild-boar", retaliation: 8, retaliationChance: 1 },
  wolf: { maximumHealth: 10, barehandedDifficulty: 72, barehandedFloor: 0.04, yield: 4, rewardItem: "meat.hare", retaliation: 9, retaliationChance: 1 },
  fox: { maximumHealth: 5, barehandedDifficulty: 45, barehandedFloor: 0.12, yield: 2, rewardItem: "meat.hare", retaliation: 3, retaliationChance: 1 },
  bear: { maximumHealth: 24, barehandedDifficulty: 92, barehandedFloor: 0.01, yield: 18, rewardItem: "meat.bear", retaliation: 16, retaliationChance: 1 },
  bison: { maximumHealth: 20, barehandedDifficulty: 84, barehandedFloor: 0.02, yield: 16, rewardItem: "meat.bison", retaliation: 13, retaliationChance: 1 },
  goat: { maximumHealth: 7, barehandedDifficulty: 48, barehandedFloor: 0.1, yield: 5, rewardItem: "meat.goat", retaliation: 4, retaliationChance: 1 },
  turkey: { maximumHealth: 4, barehandedDifficulty: 34, barehandedFloor: 0.18, yield: 3, rewardItem: "bird.turkey", retaliation: 2, retaliationChance: 1 },
  turtle: { maximumHealth: 9, barehandedDifficulty: 58, barehandedFloor: 0.08, yield: 2, rewardItem: "meat.turtle", retaliation: 2, retaliationChance: 1 },
  hare: { maximumHealth: 4, barehandedDifficulty: 26, barehandedFloor: 0.3, yield: 2, rewardItem: "meat.hare", retaliation: 1, retaliationChance: 1 },
  eagle: { maximumHealth: 7, barehandedDifficulty: 58, barehandedFloor: 0.2, yield: 3, rewardItem: "bird.eagle", retaliation: 0, retaliationChance: 0 },
  hawk: { maximumHealth: 5, barehandedDifficulty: 50, barehandedFloor: 0.24, yield: 2, rewardItem: "bird.hawk", retaliation: 0, retaliationChance: 0 },
  falcon: { maximumHealth: 5, barehandedDifficulty: 56, barehandedFloor: 0.2, yield: 2, rewardItem: "bird.falcon", retaliation: 0, retaliationChance: 0 },
  vulture: { maximumHealth: 7, barehandedDifficulty: 48, barehandedFloor: 0.25, yield: 3, rewardItem: "bird.vulture", retaliation: 0, retaliationChance: 0 },
  crow: { maximumHealth: 3, barehandedDifficulty: 40, barehandedFloor: 0.3, yield: 1, rewardItem: "bird.crow", retaliation: 0, retaliationChance: 0 },
  owl: { maximumHealth: 4, barehandedDifficulty: 52, barehandedFloor: 0.22, yield: 2, rewardItem: "bird.owl", retaliation: 0, retaliationChance: 0 },
  gull: { maximumHealth: 4, barehandedDifficulty: 42, barehandedFloor: 0.28, yield: 2, rewardItem: "bird.gull", retaliation: 0, retaliationChance: 0 },
  heron: { maximumHealth: 5, barehandedDifficulty: 46, barehandedFloor: 0.26, yield: 2, rewardItem: "bird.heron", retaliation: 0, retaliationChance: 0 },
  crane: { maximumHealth: 6, barehandedDifficulty: 48, barehandedFloor: 0.25, yield: 3, rewardItem: "bird.crane", retaliation: 0, retaliationChance: 0 },
  parrot: { maximumHealth: 3, barehandedDifficulty: 44, barehandedFloor: 0.27, yield: 1, rewardItem: "bird.parrot", retaliation: 0, retaliationChance: 0 },
  hornbill: { maximumHealth: 5, barehandedDifficulty: 46, barehandedFloor: 0.25, yield: 2, rewardItem: "bird.hornbill", retaliation: 0, retaliationChance: 0 },
} as const;

function isWildlifeType(type: string) {
  return type.startsWith("wildlifeSpawn") || type.startsWith("ambientBirdFlock");
}

function wildlifeSpecies(type: string): keyof typeof WILDLIFE {
  if (type.startsWith("ambientBirdFlock")) return type.slice("ambientBirdFlock".length).toLowerCase() as keyof typeof WILDLIFE;
  if (type.endsWith("Rabbit")) return "rabbit";
  if (type.endsWith("Deer")) return "deer";
  if (type.endsWith("Wolf")) return "wolf";
  if (type.endsWith("Fox")) return "fox";
  if (type.endsWith("Bear")) return "bear";
  if (type.endsWith("Bison")) return "bison";
  if (type.endsWith("Goat")) return "goat";
  if (type.endsWith("Turkey")) return "turkey";
  if (type.endsWith("Turtle")) return "turtle";
  if (type.endsWith("Hare")) return "hare";
  return "wild-boar";
}

// GDD section 6: skill improves odds, time and yield — it never grants permission. Reaching ripe fruit
// is limited by showing up, so it always succeeds and Foraging raises how much comes back instead.
// Skill-gated attempts leave successFloor unset and sit on the bare curve, which starts at 5%.
const ALWAYS_SUCCEEDS = 1;

type ResourceAction = {
  actionId: string;
  /** Any one of these in hand unlocks the node. Loose ground material needs nothing. */
  requiresTool?: string[];
  difficulty?: number;
  successFloor?: number;
  /** Every this many points of the governing skill adds one more unit to the reward. */
  yieldPerSkillTier?: number;
  reward?: { itemId: string; quantity: number };
  message: string;
  failureMessage: string;
  cooldownMs: number;
};

/** Each grove tree carries its own species, read off the object id the world data gives it. */
const FRUIT_BY_TREE: Array<[string, string]> = [
  ["pear", "fruit.pear"],
  ["persimmon", "fruit.persimmon"],
  ["peach", "fruit.peach"],
  ["mandarin", "fruit.mandarin"],
];

function fruitOf(objectId: string): string {
  return FRUIT_BY_TREE.find(([token]) => objectId.includes(token))?.[1] ?? "fruit.apple";
}

/**
 * A tool at full condition works as designed and a worn one works about half as well. GDD section 6.2
 * counts tool wear among the costs of doing anything, so effect fades with use rather than holding
 * full strength right up to the moment it snaps.
 */
function toolCondition(tool: ToolDefinition | undefined, wear: Record<string, number>): number {
  if (!tool) return 0;
  const remaining = Math.max(0, tool.durability - (wear[tool.itemId] ?? 0)) / tool.durability;
  return 0.5 + remaining * 0.5;
}

function strikeDamage(tool: ToolDefinition | undefined, wear: Record<string, number>, skillValue: number): number {
  if (!tool) return calculateSkillDamage(1, skillValue);
  return calculateSkillDamage(tool.damage * toolCondition(tool, wear), skillValue);
}

function scaleReward(action: ResourceAction, skillValue: number): ResourceAction["reward"] {
  if (!action.reward || !action.yieldPerSkillTier) return action.reward;
  return { ...action.reward, quantity: calculateSkillYield(action.reward.quantity, skillValue, action.yieldPerSkillTier) };
}

function resolveResourceAction(type: string, objectId: string, zoneId?: string, equippedItem?: string | null): ResourceAction | null {
  // Ground material first: without these there is no way to make the very first tool.
  if (type === "looseStone") return { actionId: "stone.flake", successFloor: ALWAYS_SUCCEEDS, yieldPerSkillTier: 40, reward: { itemId: "stone.raw", quantity: 1 }, message: "Picked up a loose stone.", failureMessage: "Nothing usable underfoot.", cooldownMs: 900 };
  if (type === "fallenBranch") return { actionId: "material.process", successFloor: ALWAYS_SUCCEEDS, yieldPerSkillTier: 40, reward: { itemId: "wood.branch", quantity: 1 }, message: "Gathered a fallen branch.", failureMessage: "The branch crumbled to rot.", cooldownMs: 900 };
  if (type === "fishingWater" || type === "riverFishingWater") {
    const regionalFish = (zoneId ? getZoneDefinition(zoneId)?.ecology.hydrology.fishHabitats : undefined)?.filter((itemId) => itemId.startsWith("fish.")) ?? [];
    const itemId = regionalFish[Math.abs(hashText(objectId)) % Math.max(1, regionalFish.length)] ?? "fish.trout";
    const fishName = foodCatalog.find((food) => food.id === itemId)?.name.en ?? itemId;
    return { actionId: "fishing.cast", requiresTool: ["tool.fishing-rod"], successFloor: 0.55, yieldPerSkillTier: 40, reward: { itemId, quantity: 1 }, message: `Caught ${fishName} from the ${type === "riverFishingWater" ? "river" : "pond"}.`, failureMessage: "The float moved, but the fish slipped free.", cooldownMs: 3000 };
  }
  if (type === "wildTree") return { actionId: "material.process", requiresTool: ["tool.hand-axe", "tool.copper-axe", "tool.iron-axe", "tool.steel-axe"], successFloor: 0.3, yieldPerSkillTier: 30, reward: { itemId: "wood.raw-log", quantity: 1 }, message: "Cut usable wood from the tree.", failureMessage: "The wood splintered and nothing usable came free.", cooldownMs: 2200 };
  if (type === "stoneOutcrop" || type.endsWith("OreDeposit") || type === "coalDeposit") return {
    actionId: "ore.mine",
    requiresTool: ["tool.pickaxe", "tool.copper-pickaxe", "tool.iron-pickaxe", "tool.steel-pickaxe"],
    successFloor: 0.55,
    yieldPerSkillTier: 30,
    reward: { itemId: "stone.raw", quantity: calculateMiningYield(equippedItem, 0) || 1 },
    message: "Broke workable stone out of the face.",
    failureMessage: "The rock held; nothing came free.",
    cooldownMs: 1800,
  };
  if (type === "wildFruitTree") return { actionId: "fruit.gather", successFloor: ALWAYS_SUCCEEDS, yieldPerSkillTier: 40, reward: { itemId: fruitOf(objectId), quantity: 1 }, message: "Gathered ripe wild fruit.", failureMessage: "The fruit fell and bruised beyond use.", cooldownMs: 1200 };
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
