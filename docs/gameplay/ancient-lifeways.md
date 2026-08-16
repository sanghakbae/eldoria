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

The beginning is deliberately austere: a new character owns no clothing, weapon, or prepared tool. The first hunting actions use the character's fists, and every useful implement must be gathered, knapped, carved, woven, or traded for in the world. Competition at this stage is against hunger, weather, injury, time, and the character's own limitations rather than another player.

## Skill relationships

- The weapon category used during a hunt raises its matching combat skill and contributes to server-calculated hit chance and damage.
- `Butchering` governs carcass processing with a butcher knife. Skill and tool quality affect yield, waste, processing time, and material quality.
- `Firemaking` governs ignition chance and fire stability. Fuel, tinder, moisture, weather, and tool quality are data-driven modifiers.
- `Cooking` governs doneness, nutrition, spoilage risk, and preservation quality.
- Healing is not a character skill. Recovery comes from physical world systems such as food, rest, medicine, consumables, and NPC services.

## Food, organs, and nutrition

Food is content data, not a generic hunger value. The catalog contains at least 50 fish, 50 birds, 50 land-meat sources, 50 vegetables, and 50 fruits. Every entry declares edible parts, a normalized gameplay nutrient profile, and the body regions those nutrients support. Meat animals can yield muscle, liver, heart, kidney, stomach, brain, marrow, and fat; species tier, body mass, weapon damage, carcass condition, tool type, and Butchering skill determine the recovered quantity and quality.

The server tracks protein, fat, carbohydrate, iron, vitamins A/C/D/B12, calcium, iodine, and water. Deficiencies become explicit body conditions rather than an unexplained debuff: blood and heart, eyes, gums and skin, bones and muscles, nervous system, thyroid, kidneys, and brain can each become strained or critical. A meat-only diet therefore cannot maintain the character indefinitely; gathered greens, roots, fruits, berries, and other foods are required for balance. Catalog numbers are game-balance values, not clinical nutrition guidance.

Fish cannot appear as a generic gathering, hunting, or ground-loot reward. Every fish definition declares `fishing` as its sole acquisition method. Catching requires reachable fishing water and a constructed or acquired method such as a hand line, hook and line, net, trap, or spear; method, material, weather, water, skill, and species determine success.

Death is followed by a physical recovery state. The character returns home incapacitated in bed for a server-calculated duration based on trauma, nutrition, rest quality, and available care. There is no trainable Healing skill.

## Progression direction

Tools and processes should support a material progression such as stone, bone, wood, fiber, hide, pottery, and eventually metal. Progression data belongs in item, skill, resource, and recipe definitions so new lifeways can be added without changing the core character model.

## SRS phase mapping

- Tasks 012–013: huntable animals, weapon-category combat, server damage.
- Tasks 014–016: carcasses, tools, raw materials, equipped butcher knife.
- Task 017: weapon skills, Butchering, Firemaking, Cooking, configurable gains.
- Tasks 018–019: fuel gathering, carcass processing, fire, cooking and preservation recipes.
- Task 022: complete hunt-to-meal vertical slice.
