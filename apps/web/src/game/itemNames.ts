import { findTool, foodCatalog } from "@eldoria/game-data";
import type { Language } from "../i18n/LanguageContext";

const fallbackItemNames: Record<string, { en: string; ko: string }> = {
  "wood.raw-log": { en: "Raw log", ko: "통나무" },
  "wood.branch": { en: "Branch", ko: "나뭇가지" },
  "stone.raw": { en: "Stone", ko: "돌덩이" },
  "tool.hand-axe": { en: "Stone axe", ko: "돌도끼" },
  "tool.copper-axe": { en: "Copper axe", ko: "구리도끼" },
  "tool.iron-axe": { en: "Iron axe", ko: "철도끼" },
  "tool.steel-axe": { en: "Steel axe", ko: "강철도끼" },
  "metal.copper-ingot": { en: "Copper ingot", ko: "구리 주괴" },
  "metal.iron-ingot": { en: "Iron ingot", ko: "철 주괴" },
  "metal.steel-ingot": { en: "Steel ingot", ko: "강철 주괴" },
  "tool.pickaxe": { en: "Stone pickaxe", ko: "돌 곡괭이" },
  "tool.copper-pickaxe": { en: "Copper pickaxe", ko: "구리 곡괭이" },
  "tool.iron-pickaxe": { en: "Iron pickaxe", ko: "철 곡괭이" },
  "tool.steel-pickaxe": { en: "Steel pickaxe", ko: "강철 곡괭이" },
  "tool.stone-spear": { en: "Stone spear", ko: "돌창" },
  "tool.fishing-rod": { en: "Fishing rod", ko: "낚싯대" },
  "material.cord": { en: "Plant cord", ko: "풀 끈" },
  "structure.log-shelter": { en: "Log shelter", ko: "통나무 집" },
  "structure.wood-bridge": { en: "Wood bridge", ko: "나무 다리" },
  "ammunition.arrow": { en: "Arrow", ko: "화살" },
  "meat.turtle": { en: "Meat (turtle)", ko: "육고기(거북이)" },
  "meat.wolf": { en: "Meat (wolf)", ko: "육고기(늑대)" },
  "meat.fox": { en: "Meat (fox)", ko: "육고기(여우)" },
  "bird.eagle": { en: "Poultry (eagle)", ko: "새고기(독수리)" },
  "bird.hawk": { en: "Poultry (hawk)", ko: "새고기(매)" },
  "bird.falcon": { en: "Poultry (falcon)", ko: "새고기(송골매)" },
  "bird.vulture": { en: "Poultry (vulture)", ko: "새고기(독수리)" },
  "bird.crow": { en: "Poultry (crow)", ko: "새고기(까마귀)" },
  "bird.owl": { en: "Poultry (owl)", ko: "새고기(올빼미)" },
  "bird.gull": { en: "Poultry (gull)", ko: "새고기(갈매기)" },
  "bird.heron": { en: "Poultry (heron)", ko: "새고기(왜가리)" },
  "bird.parrot": { en: "Poultry (parrot)", ko: "새고기(앵무새)" },
  "bird.hornbill": { en: "Poultry (hornbill)", ko: "새고기(코뿔새)" },
};

/**
 * The food catalog names the creature, not the cut, so a carried `meat.rabbit` would read as "Rabbit".
 * Butchered categories lead with the carried material and keep the species in parentheses, so stacks
 * sort and scan as `육고기(토끼)`, `육고기(사슴)` instead of looking like live animals.
 */
export function itemDisplayName(itemId: string, language: Language): string {
  const food = foodCatalog.find((candidate) => candidate.id === itemId);
  if (!food) return findTool(itemId)?.name[language] ?? fallbackItemNames[itemId]?.[language] ?? itemId;
  if (food.category === "meat") {
    return language === "ko" ? `육고기(${food.name.ko})` : `Meat (${food.name.en})`;
  }
  if (food.category === "bird") {
    return language === "ko" ? `새고기(${food.name.ko})` : `Poultry (${food.name.en})`;
  }
  return food.name[language];
}
