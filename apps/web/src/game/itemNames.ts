import { foodCatalog } from "@eldoria/game-data";
import type { Language } from "../i18n/LanguageContext";

const fallbackItemNames: Record<string, { en: string; ko: string }> = {
  "wood.raw-log": { en: "Raw log", ko: "통나무" },
  "wood.branch": { en: "Branch", ko: "나뭇가지" },
  "stone.raw": { en: "Stone", ko: "돌덩이" },
  "tool.hand-axe": { en: "Hand axe", ko: "돌도끼" },
  "tool.pickaxe": { en: "Pickaxe", ko: "곡괭이" },
  "tool.stone-spear": { en: "Stone spear", ko: "돌창" },
  "tool.fishing-rod": { en: "Fishing rod", ko: "낚싯대" },
  "material.cord": { en: "Plant cord", ko: "풀 끈" },
};

/**
 * The food catalog names the creature, not the cut, so a carried `meat.rabbit` would read as "Rabbit".
 * Butchered categories get the part appended; produce is already named as the thing you hold.
 */
export function itemDisplayName(itemId: string, language: Language): string {
  const food = foodCatalog.find((candidate) => candidate.id === itemId);
  if (!food) return fallbackItemNames[itemId]?.[language] ?? itemId;
  if (food.category === "meat" || food.category === "bird") {
    return language === "ko" ? `${food.name.ko} 고기` : `${food.name.en} meat`;
  }
  return food.name[language];
}
