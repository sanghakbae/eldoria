# Ancient lifeways gameplay principle

Eldoria's sandbox progression should model connected ancient subsistence activities rather than isolated level-grinding actions. A successful hunt is the beginning of a production chain, not an instant food reward.

## Hunting and food loop

```text
track animal
  -> hunt with a weapon
  -> kill and recover carcass
  -> butcher with a butcher knife
  -> collect meat, hide, bone, sinew, and fat
  -> gather fuel and tinder
  -> ignite and maintain a fire
  -> roast, smoke, dry, or otherwise preserve food
  -> consume or store it
```

Each step is a server-authoritative action with tool, range, resource, cooldown, and state validation. Failure must not be decided by the client.

## Skill relationships

- The weapon category used during a hunt raises its matching combat skill and contributes to server-calculated hit chance and damage.
- `Butchering` governs carcass processing with a butcher knife. Skill and tool quality affect yield, waste, processing time, and material quality.
- `Firemaking` governs ignition chance and fire stability. Fuel, tinder, moisture, weather, and tool quality are data-driven modifiers.
- `Cooking` governs doneness, nutrition, spoilage risk, and preservation quality.
- Healing is not a character skill. Recovery comes from physical world systems such as food, rest, medicine, consumables, and NPC services.

## Progression direction

Tools and processes should support a material progression such as stone, bone, wood, fiber, hide, pottery, and eventually metal. Progression data belongs in item, skill, resource, and recipe definitions so new lifeways can be added without changing the core character model.

## SRS phase mapping

- Tasks 012–013: huntable animals, weapon-category combat, server damage.
- Tasks 014–016: carcasses, tools, raw materials, equipped butcher knife.
- Task 017: weapon skills, Butchering, Firemaking, Cooking, configurable gains.
- Tasks 018–019: fuel gathering, carcass processing, fire, cooking and preservation recipes.
- Task 022: complete hunt-to-meal vertical slice.
