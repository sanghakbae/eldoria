# 2D Sandbox MMORPG — Codex Development Specification

- **Document Version:** 0.2
- **Status:** Development Baseline
- **Target:** Web-first 2D Sandbox MMORPG → iOS / Android
- **Development Method:** Codex / AI-assisted Vibe Coding
- **Primary Reference:** Ultima Online-style sandbox MMORPG concepts
- **Important:** The project must use original worldbuilding, names, artwork, maps, sounds, text, and game content. Do not copy Ultima Online copyrighted assets or proprietary content.

---

# 1. Purpose

This document is the baseline specification for implementing a 2D sandbox MMORPG with Codex.

The project should reproduce the **systemic characteristics** of a classic sandbox MMORPG:

- skill-based character progression
- player freedom
- PvE
- crafting
- gathering
- player economy
- trading
- social systems
- exploration
- optional PvP
- future housing and guild systems

The goal is **not** to reproduce Ultima Online itself.

The first implementation target is a small but fully playable multiplayer vertical slice.

## 1.1 MVP success criteria

The MVP is successful when:

1. A user can create an account.
2. A user can create a character.
3. Two or more users can enter the same 2D world.
4. Players can move around the world.
5. Players can see other players.
6. Monsters exist and have basic AI.
7. Players can attack monsters.
8. The authoritative game server calculates combat results.
9. Monsters can die and generate loot.
10. Players can acquire and equip items.
11. Players have skills that increase through gameplay.
12. Players can gather resources.
13. Players can craft basic items.
14. Players can buy/sell items to NPC merchants.
15. Players can communicate through chat.
16. Persistent character data survives reconnects.
17. The game can run in a normal desktop browser.
18. The architecture can later be packaged as a mobile application.

---

# 2. Product Vision

The game is a persistent 2D sandbox world where players decide what kind of character they want to become.

There is no mandatory linear level progression.

A player may focus on:

- combat
- magic
- gathering
- crafting
- trading
- exploration
- social activities
- PvP
- future housing
- future guild activities

The central design principle is:

> The game provides a world and systems; the player creates their own goals.

---

# 3. Platform Strategy

## 3.1 Phase 1

Primary:

- Desktop Web

Secondary:

- Mobile Web
- Tablet Web

## 3.2 Phase 2

Native mobile packaging:

- iOS
- Android

The mobile application should reuse the web client as much as practical.

Recommended approach:

```text
React + Phaser
      |
      +---- Web
      |
      +---- Capacitor
              |
              +---- iOS
              +---- Android
```

Do not create separate gameplay implementations for Web, iOS, and Android.

---

# 4. Technology Stack

## 4.1 Frontend

- TypeScript
- React
- Phaser 4
- Vite
- Zustand
- Tailwind CSS

Responsibilities:

### React

- Login
- Registration
- Character selection
- Character management
- Inventory UI
- Equipment UI
- Skill UI
- Settings
- Chat UI
- Shop UI
- Crafting UI
- System menus

### Phaser

- World rendering
- Tile map
- Player rendering
- NPC rendering
- Monster rendering
- Animation
- Camera
- Effects
- Game input integration

The game engine must not contain business rules that should be authoritative on the server.

---

# 5. Backend Strategy

The backend is deliberately divided into two responsibilities.

## 5.1 Firebase

Firebase is the application backend and persistent-data platform.

Use:

- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- Firebase Cloud Messaging
- Firebase Hosting where appropriate

Firebase is responsible for:

- account identity
- persistent character data
- inventory persistence
- equipment persistence
- skill persistence
- currency persistence
- guild persistence
- housing persistence in later phases
- application assets
- push notifications
- administrative/application data

## 5.2 Game Server

Use:

- Node.js
- TypeScript
- WebSocket

The Game Server is authoritative for:

- player runtime state
- player movement validation
- world state
- entity state
- monster AI
- combat
- damage calculation
- cooldowns
- skill gain calculation
- loot generation
- resource harvesting
- temporary buffs/debuffs
- proximity/interest management
- multiplayer synchronization

## 5.3 Redis

Redis is **not required for MVP**.

Do not add Redis unless there is a concrete requirement.

Future use cases:

- multiple game server instances
- cross-server state
- server-to-server Pub/Sub
- session routing
- distributed locks where necessary
- high-speed cache
- leaderboard structures

Initial architecture:

```text
Browser
   |
   | WebSocket
   v
Game Server
   |
   | Firebase Admin SDK
   v
Firebase
```

Future scale-out:

```text
                  Load Balancer
                       |
          +------------+------------+
          |            |            |
       Game A       Game B       Game C
          |            |            |
          +------------+------------+
                       |
                  Redis/Valkey
                       |
                    Firebase
```

Do not design the MVP around Redis.

---

# 6. Critical Architecture Principle

## Server authoritative architecture

The client is never trusted for authoritative game state.

The client sends **intent**.

Example:

```text
Client:
"Attack entity 123"
```

The server validates:

1. player is authenticated
2. player exists
3. target exists
4. target is attackable
5. player is alive
6. player is within range
7. weapon is valid
8. cooldown has elapsed
9. game rules permit the action

Then the server performs:

```text
hit calculation
      |
damage calculation
      |
armor/resistance
      |
HP update
      |
death check
      |
loot generation
      |
skill gain
```

The client receives the result and renders it.

---

# 7. State Ownership

This boundary must never be violated.

## 7.1 Client-owned state

Client may own:

- UI state
- camera position
- local animation state
- input state
- visual effects
- locally cached presentation data

Client must NOT authoritatively own:

- HP
- Mana
- Stamina
- Gold
- Item ownership
- Skill value
- Damage
- Position validity
- Loot
- Crafting result
- Trade result

## 7.2 Game Server runtime state

Keep in server memory initially:

- current player position
- current player movement state
- nearby entities
- monster position
- monster AI state
- active combat state
- cooldowns
- temporary effects
- zone runtime state

## 7.3 Firebase persistent state

Persist:

- account
- character
- attributes
- skills
- inventory
- equipment
- currency
- completed quests
- guild membership
- housing
- achievements
- important audit events

---

# 8. Data Model

Recommended Firestore structure:

```text
/users/{uid}

/characters/{characterId}

/characters/{characterId}/skills/{skillId}

/characters/{characterId}/inventory/{itemInstanceId}

/characters/{characterId}/equipment/{slot}

/characters/{characterId}/quests/{questId}

/items/{itemId}

/recipes/{recipeId}

/monsters/{monsterId}

/zones/{zoneId}

/guilds/{guildId}

/guilds/{guildId}/members/{characterId}
```

Do not store the complete runtime world state in Firestore.

---

# 9. Repository Structure

Use a monorepo.

```text
project/
|
+-- apps/
|   +-- web/
|   +-- game-server/
|   +-- admin/
|
+-- packages/
|   +-- game-core/
|   +-- game-protocol/
|   +-- game-data/
|   +-- shared-types/
|   +-- ui/
|
+-- assets/
|   +-- tiles/
|   +-- characters/
|   +-- monsters/
|   +-- items/
|   +-- effects/
|   +-- audio/
|
+-- data/
|   +-- items/
|   +-- monsters/
|   +-- npcs/
|   +-- recipes/
|   +-- skills/
|   +-- zones/
|   +-- loot-tables/
|
+-- database/
|
+-- docs/
|
+-- tools/
|
+-- package.json
+-- pnpm-workspace.yaml
+-- README.md
```

Recommended package manager:

- pnpm

---

# 10. Shared Domain Model

Use shared TypeScript types.

Example:

```ts
export type EntityType =
  | "player"
  | "monster"
  | "npc"
  | "resource"
  | "item";

export interface Position {
  zoneId: string;
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  type: EntityType;
  position: Position;
}
```

The shared package may contain:

- types
- enums
- protocol definitions
- pure deterministic calculations that are safe to share

It must not cause the client to become authoritative.

---

# 11. World System

The world is tile-based.

Recommended initial tile size:

- 32x32 pixels

Map source:

- Tiled JSON or equivalent structured map format

Map layers:

```text
terrain
collision
decoration
objects
spawn
```

World hierarchy:

```text
World
 |
 +-- Town
 |
 +-- Forest
 |
 +-- Mountain
 |
 +-- Swamp
 |
 +-- Wilderness
 |
 +-- Dungeon
```

---

# 12. Zone System

The world is divided into zones.

A zone contains:

- map
- spawn points
- NPCs
- resources
- monsters
- environmental objects

The Game Server should only synchronize entities relevant to a player's current zone and visibility range.

This is the first level of interest management.

---

# 13. Entity System

Entity types:

- Player
- Monster
- NPC
- Resource Node
- World Object
- Projectile where required

Each entity has:

```ts
id
type
position
zoneId
```

Additional state belongs to the specific entity type.

---

# 14. Character System

## 14.1 Attributes

Initial attributes:

- Strength
- Dexterity
- Intelligence

Derived values:

- HP
- Mana
- Stamina
- Attack Power
- Defense
- Magic Power
- Movement Speed

Avoid traditional character levels in the MVP.

---

# 15. Skill System

Skills are the primary progression mechanism.

Initial skills:

1. Swordsmanship
2. Mace Fighting
3. Archery
4. Magic
5. Healing
6. Mining
7. Lumberjacking
8. Blacksmithing
9. Tailoring
10. Cooking
11. Fishing

The architecture must support adding new skills without modifying the core character model.

---

# 16. Skill Progression

Skill increases from successful or meaningful actions.

Generic flow:

```text
Action
  |
  v
Skill Check
  |
  +-- failure
  |
  +-- success
        |
        v
    Skill Gain
```

Skill gain should be calculated by the server.

Initial conceptual formula:

```text
gain =
  baseGain
  * difficultyModifier
  * activityModifier
  * randomFactor
```

The formula must be configurable through game data.

---

# 17. Skill Cap

Initial total skill cap:

- 600

The architecture must support configurable caps.

Example:

```text
Swordsmanship   100
Tactics         100
Healing         100
Mining           80
Blacksmithing    80
Magic            60
Cooking          40
Fishing          40
-------------------
Total            600
```

The exact balancing values are configuration, not hard-coded rules.

---

# 18. Combat System

Combat is server authoritative.

Flow:

```text
Attack Input
    |
    v
Server Validation
    |
    v
Range Check
    |
    v
Cooldown Check
    |
    v
Hit Calculation
    |
    v
Damage Calculation
    |
    v
Defense / Resistance
    |
    v
HP Update
    |
    v
Death Check
    |
    v
Loot
```

Initial combat should support:

- melee attack
- ranged attack
- basic magic later
- hit chance
- damage
- armor reduction
- death

---

# 19. Monster AI

Initial states:

```text
IDLE
PATROL
DETECT
CHASE
ATTACK
FLEE
RETURN
DEAD
```

Monster behavior:

```text
IDLE
 |
 +-- player detected --> CHASE
                         |
                         v
                       ATTACK
                         |
              +----------+----------+
              |                     |
          target lost          target dead
              |                     |
              v                     v
           RETURN                 IDLE
```

AI must run on the server.

---

# 20. Loot System

Loot is generated server-side.

Each monster references a loot table.

Example:

```json
{
  "monsterId": "wolf",
  "entries": [
    {
      "itemId": "wolf_pelt",
      "chance": 0.65,
      "min": 1,
      "max": 2
    },
    {
      "itemId": "gold",
      "chance": 1.0,
      "min": 5,
      "max": 20
    }
  ]
}
```

Loot tables are data-driven.

---

# 21. Item System

Item categories:

- Weapon
- Armor
- Consumable
- Material
- Tool
- Quest Item
- Decoration
- Currency

Separate:

### Item Definition

Static master data.

```text
itemId
name
category
weight
stackable
baseValue
properties
```

### Item Instance

Player-owned object.

```text
itemInstanceId
itemId
ownerId
quantity
durability
randomProperties
```

This distinction is mandatory.

---

# 22. Inventory

Inventory must be server authoritative.

Operations:

- add item
- remove item
- split stack
- merge stack
- equip
- unequip
- use
- drop
- destroy

Every inventory mutation must be validated server-side.

---

# 23. Equipment

Initial equipment slots:

- Head
- Chest
- Legs
- Feet
- Main Hand
- Off Hand
- Ring
- Neck

Equipment rules are server-side.

---

# 24. Durability

Equipment may have durability.

Initial states:

```text
100% -> normal
50%  -> normal
10%  -> warning
0%   -> broken
```

The exact gameplay effect is configurable.

---

# 25. Gathering

Initial resources:

- Ore
- Wood
- Herb
- Fish

Resource flow:

```text
Player
  |
  v
Resource Node
  |
  v
Validation
  |
  v
Gathering Skill Check
  |
  v
Resource Result
  |
  v
Skill Gain
```

Resource nodes have respawn timers.

---

# 26. Crafting

Initial crafting paths:

```text
Mining
  |
Ore
  |
Smelting
  |
Metal
  |
Blacksmithing
  |
Weapon / Armor
```

and:

```text
Lumberjacking
  |
Wood
  |
Carpentry
  |
Furniture
```

Crafting recipes are data-driven.

---

# 27. NPC System

Initial NPC types:

- Merchant
- Blacksmith
- Healer
- Mage
- Guard
- Innkeeper
- Trainer

NPC interactions:

- dialogue
- buy
- sell
- repair
- heal
- training

---

# 28. Economy

Currency:

- Gold

Gold sources:

- monster loot
- NPC sales
- quests
- gathering
- crafting
- player trade

Gold sinks:

- NPC purchases
- repairs
- healing
- training
- transportation
- future housing

Gold changes must be atomic and server authoritative.

---

# 29. Player Trading

Use a two-phase confirmation flow.

```text
Player A Offer
Player B Offer
      |
      v
Both players confirm
      |
      v
Server validates
      |
      v
Atomic transaction
      |
      v
Items and Gold exchanged
```

If either player changes the offer, previous confirmation becomes invalid.

---

# 30. Death and Respawn

Initial death flow:

```text
HP = 0
 |
 v
DEAD
 |
 v
Corpse / Loot handling
 |
 v
Respawn
```

MVP may use a simplified death penalty.

Do not implement full-loss PvP rules initially.

---

# 31. Chat

Initial channels:

- Local
- Global
- Whisper
- System

Later:

- Party
- Guild

Chat must support:

- authentication
- rate limiting
- message length limits
- basic moderation hooks

---

# 32. PvP

PvP is initially limited to designated PvP zones.

MVP:

- player attack
- player damage
- player death
- PvP zone flag

Later:

- open-world PvP
- crime system
- murder system
- guild war
- reputation

---

# 33. Guild

Phase 2.

Guild data:

```text
guildId
name
leaderId
members
ranks
permissions
bank
```

Ranks:

- Leader
- Officer
- Member
- Recruit

---

# 34. Housing

Phase 2.

House data:

```text
houseId
ownerId
location
size
storage
permissions
furniture
```

Permissions:

- Owner
- Co-owner
- Friend
- Visitor
- Blocked

---

# 35. UI Requirements

## Desktop layout

```text
+----------------------------------------------+
| HP / Mana / Stamina                           |
+----------------------------------------------+
|                                              |
|                 GAME WORLD                   |
|                                              |
|                                              |
+----------------------------------------------+
| Chat                              Action Bar |
+----------------------------------------------+
```

## Mobile layout

```text
+----------------------+
| HP / Mana / Stamina  |
+----------------------+
|                      |
|      GAME WORLD      |
|                      |
|                      |
+----------------------+
| Joystick      Skills |
|               Action |
+----------------------+
```

UI must be responsive.

---

# 36. Input Abstraction

Do not place keyboard or touch logic directly into game rules.

Use:

```text
Keyboard / Mouse
       |
Touch / Joystick
       |
       v
Input Adapter
       |
       v
Game Command
       |
       v
Game System
```

Example:

```ts
type GameCommand =
  | { type: "move"; direction: Direction }
  | { type: "attack"; targetId: string }
  | { type: "interact"; entityId: string }
  | { type: "useItem"; itemInstanceId: string };
```

---

# 37. WebSocket Protocol

Initial client-to-server messages:

```text
auth
player.join
player.move
player.stop
player.attack
player.interact
player.useItem
player.equip
player.unequip
player.gather
player.craft
chat.send
trade.offer
trade.confirm
trade.cancel
```

Initial server-to-client messages:

```text
auth.success
world.snapshot
entity.spawn
entity.update
entity.despawn
player.state
combat.result
damage
death
loot
inventory.update
skill.update
craft.result
chat.message
trade.update
error
```

Every message must have:

```text
message type
request id / sequence where applicable
payload
```

---

# 38. Network Rules

The server must validate:

- movement speed
- movement distance
- action frequency
- attack range
- attack cooldown
- item ownership
- skill requirements
- crafting materials
- trade ownership
- resource availability

Never trust client timestamps for authoritative gameplay.

---

# 39. Authentication

Firebase Authentication is the identity provider.

Supported initial methods:

- Email/password
- Google

Add Apple Sign-In before iOS production launch if required.

The client obtains a Firebase ID token.

The Game Server validates the token using Firebase Admin SDK.

Flow:

```text
Client
 |
 | Firebase Login
 v
Firebase Auth
 |
 | ID Token
 v
Game Server
 |
 | Token verification
 v
Authenticated Session
```

---

# 40. Security Requirements

## SEC-001

Client input is untrusted.

## SEC-002

All game state mutations are server-side.

## SEC-003

Gold creation is server-side only.

## SEC-004

Item creation is server-side only.

## SEC-005

Loot generation is server-side only.

## SEC-006

Skill gain is server-side only.

## SEC-007

Trade completion is atomic.

## SEC-008

WebSocket sessions require authentication.

## SEC-009

Rate limiting is required.

## SEC-010

Administrative actions require authorization.

## SEC-011

Audit logs must record economically significant mutations.

## SEC-012

Secrets must never be committed to Git.

---

# 41. Audit Events

Record at minimum:

```text
LOGIN
LOGOUT
CHARACTER_CREATE
CHARACTER_DELETE
ITEM_CREATE
ITEM_DELETE
ITEM_TRANSFER
GOLD_CHANGE
SKILL_GAIN
COMBAT
PLAYER_DEATH
TRADE
CRAFT
RESOURCE_GATHER
EQUIP
UNEQUIP
ADMIN_ACTION
```

Audit logs must include:

- timestamp
- actor
- action
- target
- result
- metadata where appropriate

---

# 42. Anti-Cheat

Initial protections:

- server-authoritative movement
- speed validation
- action cooldown validation
- range validation
- impossible-state detection
- request rate limiting

Do not build a complex anti-bot system in MVP.

Add behavioral detection only after real gameplay telemetry exists.

---

# 43. Admin Console

Admin application should provide:

- player search
- character search
- inventory inspection
- gold inspection
- skill inspection
- account status
- ban
- mute
- audit log search
- server status

Administrative mutations must be audited.

---

# 44. Configuration

Gameplay balance must be data-driven.

Do not hard-code:

- damage multipliers
- skill gain rates
- gold drops
- respawn times
- crafting requirements
- item values
- monster stats

Example:

```json
{
  "combat": {
    "baseDamageMultiplier": 1.0,
    "criticalChance": 0.05
  },
  "skills": {
    "baseGain": 0.1
  },
  "economy": {
    "goldDropMultiplier": 1.0
  }
}
```

---

# 45. Content Data

Use data-driven content.

```text
data/
+-- items/
+-- monsters/
+-- npcs/
+-- recipes/
+-- skills/
+-- zones/
+-- loot-tables/
```

New content should normally be added by data rather than changing core engine code.

---

# 46. Persistence Rules

The Game Server should not write every runtime state change to Firebase.

Use persistence boundaries.

Persist immediately or transactionally for:

- Gold
- Inventory mutation
- Equipment mutation
- Skill progression
- Character creation
- Character deletion
- Trade completion
- Crafting result

Runtime state such as position may be:

- kept in memory
- periodically checkpointed
- persisted on disconnect
- persisted at safe intervals

Do not over-write Firestore on every movement update.

---

# 47. Firestore Design Rules

Avoid oversized documents.

Do not store a complete inventory, complete skill tree, and all equipment in one character document if that would create high write contention.

Prefer subcollections where appropriate.

Use Firestore transactions for:

- gold transfers
- trade completion
- inventory mutations that require atomicity

Use server-side validation before all writes.

---

# 48. Performance Requirements

## Client

Desktop target:

- 60 FPS

Mobile target:

- 30 FPS minimum under reasonable device conditions

## Server

Initial target:

- 50-100 concurrent players on a single Game Server as an engineering baseline

This is a target for initial testing, not a guaranteed capacity.

## Networking

Use:

- interest management
- zone filtering
- delta updates where practical
- throttled state updates
- batching

Do not broadcast the entire world state to every player.

---

# 49. Development Environment

Recommended:

- Node.js LTS
- pnpm
- Git
- Docker
- Firebase CLI
- TypeScript
- ESLint
- Prettier
- Vitest
- Playwright

Development Firebase should use the Firebase Emulator Suite where practical.

---

# 50. Testing Strategy

## Unit tests

Test:

- damage calculations
- hit calculations
- skill gain
- inventory rules
- item stacking
- crafting
- loot
- movement validation

## Integration tests

Test:

- authentication
- character persistence
- inventory persistence
- trade
- crafting
- WebSocket authentication

## End-to-end tests

Minimum scenarios:

1. Register
2. Login
3. Create character
4. Enter world
5. Move
6. See another player
7. Attack monster
8. Kill monster
9. Loot item
10. Equip item
11. Gain skill
12. Disconnect
13. Reconnect
14. Verify state persisted

---

# 51. Codex Development Rules

Codex must follow these rules.

## RULE-001

Do not implement the entire game in one task.

## RULE-002

Implement one vertical slice at a time.

## RULE-003

Before changing architecture, inspect the existing repository.

## RULE-004

Do not rewrite working modules unnecessarily.

## RULE-005

Do not introduce new dependencies unless required.

## RULE-006

Do not introduce Redis in MVP.

## RULE-007

Do not introduce PostgreSQL in MVP.

## RULE-008

Do not move authoritative game logic into React or Phaser.

## RULE-009

Every new feature requires tests.

## RULE-010

Run lint and tests after meaningful changes.

## RULE-011

Keep configuration outside core gameplay code.

## RULE-012

Do not use copyrighted UO assets.

## RULE-013

Do not expose Firebase Admin credentials to the client.

## RULE-014

Do not store secrets in source control.

## RULE-015

Document significant architectural decisions in ADR files.

---

# 52. Codex Task Format

Each Codex task should follow:

```text
1. Inspect
2. Plan
3. Implement
4. Test
5. Verify
6. Summarize changes
```

Codex should not start coding before inspecting relevant files.

For complex changes, Codex should first provide a short implementation plan internally and then execute it.

---

# 53. Development Phases

## Phase 0 — Foundation

- monorepo
- Vite
- React
- Phaser
- Node.js
- TypeScript
- Firebase
- WebSocket
- lint
- formatting
- testing
- environment configuration

Acceptance:

- web application starts
- game server starts
- Firebase connection works
- WebSocket connection works

---

## Phase 1 — Authentication

Implement:

- registration
- login
- logout
- Firebase token
- Game Server token verification

Acceptance:

- authenticated user can establish a game connection

---

## Phase 2 — Character

Implement:

- character creation
- character list
- character selection
- character persistence

Acceptance:

- character survives logout/login

---

## Phase 3 — World

Implement:

- tile map
- camera
- player rendering
- collision
- movement

Acceptance:

- player can move around the world

---

## Phase 4 — Multiplayer

Implement:

- WebSocket
- player join
- player leave
- player movement synchronization
- entity visibility

Acceptance:

- two browser windows can see each other and move

---

## Phase 5 — Monster

Implement:

- monster spawn
- monster AI
- detection
- chase
- attack
- death
- respawn

Acceptance:

- monsters behave correctly without client authority

---

## Phase 6 — Combat

Implement:

- weapon
- attack
- hit
- damage
- HP
- death

Acceptance:

- server determines combat results

---

## Phase 7 — Inventory

Implement:

- item definitions
- item instances
- inventory
- loot
- equip
- unequip

Acceptance:

- item ownership persists across reconnect

---

## Phase 8 — Skills

Implement:

- skill definitions
- skill values
- skill gain
- skill cap
- skill UI

Acceptance:

- gameplay can increase skills and values persist

---

## Phase 9 — Gathering

Implement:

- resource nodes
- mining
- lumberjacking
- fishing
- resource respawn

---

## Phase 10 — Crafting

Implement:

- recipes
- material requirements
- crafting skill check
- item creation

---

## Phase 11 — Economy

Implement:

- gold
- NPC merchant
- buy
- sell
- repair

---

## Phase 12 — Chat

Implement:

- local
- global
- whisper
- moderation hooks
- rate limiting

---

## Phase 13 — Dungeon

Implement:

- dungeon map
- monsters
- elite
- boss
- loot tables

---

## Phase 14 — PvP

Implement:

- PvP zones
- player combat
- death
- basic PvP rules

---

## Phase 15 — Guild

Implement:

- guild creation
- invite
- join
- leave
- ranks
- guild chat

---

## Phase 16 — Housing

Implement:

- house placement
- ownership
- storage
- permissions
- furniture

---

## Phase 17 — Mobile

Implement:

- touch controls
- virtual joystick
- responsive UI
- mobile inventory
- mobile chat
- Capacitor
- iOS build
- Android build

---

# 54. First Playable Vertical Slice

Do not build all systems before testing the core game loop.

The first playable slice must contain only:

```text
Login
  |
Character
  |
World
  |
Movement
  |
Monster
  |
Combat
  |
Death
  |
Loot
  |
Inventory
  |
Equipment
```

The target experience is:

> Login → create character → enter town → walk into forest → find monster → attack → kill → loot → equip → return to town.

This slice must be fun and stable before expanding the feature set.

---

# 55. MVP Content Scope

Initial world:

- 1 town
- 1 forest
- 1 dungeon
- 1 small wilderness area

Initial NPCs:

- Merchant
- Healer
- Blacksmith
- Trainer

Initial monsters:

- Wolf
- Rat
- Bandit
- Skeleton
- Dungeon Boss

Initial weapons:

- Sword
- Mace
- Bow

Initial armor:

- Cloth
- Leather
- Chain
- Plate

Keep content intentionally small.

---

# 56. Graphics Strategy

Use original 2D pixel-art assets.

Initial requirements:

- 32x32 tiles
- 4-direction player sprites
- simple attack animation
- simple monster animation
- basic environmental tiles
- UI icons

Do not block gameplay development waiting for final art.

Use placeholder assets during system development.

Replace assets later without changing gameplay code.

---

# 57. Asset Abstraction

Use asset IDs instead of direct paths throughout gameplay code.

Example:

```ts
spriteKey: "player.warrior"
spriteKey: "monster.wolf"
spriteKey: "item.iron_sword"
```

The asset registry resolves IDs to actual files.

This allows the graphics layer to change independently.

---

# 58. Observability

Initial logging:

- server start
- connection
- authentication
- player join
- player leave
- combat errors
- persistence errors
- transaction failures
- unexpected game state

Later:

- OpenTelemetry
- metrics
- distributed tracing
- structured logs

Do not add a complicated observability stack during the first prototype unless needed.

---

# 59. Cost Control

MVP principles:

1. Do not introduce Redis.
2. Do not introduce PostgreSQL.
3. Do not introduce Kubernetes.
4. Do not introduce microservices.
5. Use a single Game Server.
6. Use Firebase for persistent application data.
7. Use Firebase Emulator Suite locally.
8. Keep Firestore writes controlled.
9. Do not persist movement every frame.
10. Use data-driven content instead of expensive runtime generation where possible.

---

# 60. Initial Deployment

Target architecture:

```text
                    Internet
                       |
                    Cloudflare
                       |
            +----------+----------+
            |                     |
        Web Client            Game Server
            |                     |
            |                 WebSocket
            |                     |
            +----------+----------+
                       |
                    Firebase
              +--------+--------+
              |        |        |
             Auth   Firestore Storage
```

A small cloud VM/container is sufficient for the initial Game Server.

Do not deploy Kubernetes until scale requires it.

---

# 61. Future Scale Architecture

Only when justified by real usage:

```text
                       Load Balancer
                            |
              +-------------+-------------+
              |             |             |
          Zone Server A  Zone Server B  Zone Server C
              |             |             |
              +-------------+-------------+
                            |
                       Redis/Valkey
                            |
                      Persistence Layer
                       /            \
                 Firestore       PostgreSQL
```

Possible future additions:

- Redis/Valkey
- PostgreSQL
- multiple zones
- matchmaking
- dedicated chat service
- dedicated analytics pipeline

These are not MVP requirements.

---

# 62. Non-Functional Requirements

## Reliability

- no duplication of item ownership
- no negative gold
- no unauthorized inventory mutation
- trade must be atomic
- reconnect must recover persistent state

## Security

- server authority
- Firebase token verification
- authorization
- rate limiting
- audit logging
- secret management

## Maintainability

- TypeScript strict mode
- modular domain design
- tests
- data-driven content
- documented APIs
- ADRs

## Portability

- browser first
- mobile packaging later
- gameplay logic independent of input device

---

# 63. Definition of Done

A feature is complete only when:

- requirement is implemented
- server/client boundary is correct
- persistence is correct where required
- authorization is implemented
- tests exist
- lint passes
- TypeScript build passes
- relevant manual scenario works
- no unrelated refactoring was introduced
- documentation is updated if architecture changed

---

# 64. Immediate Codex Execution Plan

Codex should execute the project in this exact order.

### Task 001

Create the monorepo and base documentation.

### Task 002

Create React + Vite + TypeScript web application.

### Task 003

Add Phaser and render a basic game scene.

### Task 004

Create Node.js + TypeScript Game Server.

### Task 005

Implement WebSocket connection.

### Task 006

Configure Firebase Authentication.

### Task 007

Implement Firebase Admin token verification in Game Server.

### Task 008

Create character persistence.

### Task 009

Create tile map and collision.

### Task 010

Implement server-authoritative player movement.

### Task 011

Implement multiplayer player synchronization.

### Task 012

Implement monster entity and AI.

### Task 013

Implement server-authoritative combat.

### Task 014

Implement items and inventory.

### Task 015

Implement loot.

### Task 016

Implement equipment.

### Task 017

Implement skills.

### Task 018

Implement gathering.

### Task 019

Implement crafting.

### Task 020

Implement NPC economy.

### Task 021

Implement chat.

### Task 022

Create first complete playable vertical slice.

Only after Task 022 is stable should the project proceed to advanced systems.

---

# 65. Final Architecture Decision

The baseline architecture is:

```text
                    +--------------------+
                    |      Browser       |
                    |                    |
                    | React + Phaser     |
                    +---------+----------+
                              |
                         WebSocket
                              |
                              v
                    +--------------------+
                    |    Game Server     |
                    | Node.js/TypeScript |
                    |                    |
                    | World              |
                    | Movement           |
                    | Combat             |
                    | Monster AI         |
                    | Skills             |
                    | Loot               |
                    +---------+----------+
                              |
                    Firebase Admin SDK
                              |
                 +------------+------------+
                 |            |            |
              Firebase     Firestore    Storage
                Auth

                 Redis: NOT REQUIRED IN MVP
                 PostgreSQL: NOT REQUIRED IN MVP
```

The project should prioritize:

1. Correct game/server boundary
2. Small playable vertical slice
3. Persistent character progression
4. Data-driven content
5. Security and anti-cheat fundamentals
6. Automated tests
7. Simple infrastructure
8. Gradual scale-out only when justified

---

# 66. Codex Master Prompt

Use the following instruction as the initial project-level instruction for Codex:

> Read `SRS.md` completely before modifying the repository.
>
> You are implementing a 2D sandbox MMORPG based on this specification.
>
> Follow these rules:
>
> 1. Do not implement the entire game at once.
> 2. Work in the specified task order.
> 3. Inspect the current repository before changing files.
> 4. Keep the client non-authoritative.
> 5. Put authoritative game rules in the Game Server.
> 6. Use Firebase for authentication and persistent application data.
> 7. Do not introduce Redis or PostgreSQL during MVP unless explicitly requested.
> 8. Do not introduce microservices or Kubernetes during MVP.
> 9. Use TypeScript strict mode.
> 10. Keep gameplay content data-driven.
> 11. Add tests for every meaningful game rule.
> 12. Do not introduce copyrighted Ultima Online assets or content.
> 13. Prefer simple architecture over premature abstraction.
> 14. Do not perform unrelated refactoring.
> 15. After each task, run relevant tests and type checks.
> 16. Report changed files, tests executed, and remaining issues.
>
> Start with Task 001 only. Do not proceed to later tasks until Task 001 is complete and verified.

---

# 67. Project Principle

The project should evolve according to:

```text
Simple
  |
  v
Playable
  |
  v
Correct
  |
  v
Persistent
  |
  v
Secure
  |
  v
Scalable
```

Do not reverse this order.

The goal is to build a **small, playable, server-authoritative sandbox MMORPG first**, then progressively add the systems that make the world deeper.
