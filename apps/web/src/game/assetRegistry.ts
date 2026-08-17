const assets = {
  "world.untamedWilds": "/assets/world/untamed-wilds.png",
  "world.animalDen": "/assets/world/animal-den.png",
  "resource.wildFruitTree": "/assets/world/wild-fruit-tree.png",
  "resource.wildTree": "/assets/world/resources/wild-tree.png",
  "resource.looseStone": "/assets/world/resources/loose-stone.png",
  "resource.fallenBranch": "/assets/world/resources/fallen-branch.png",
  "resource.copperOreDeposit": "/assets/world/resources/copper-ore.png",
  "resource.coalDeposit": "/assets/world/resources/coal-ore.png",
  "resource.ironOreDeposit": "/assets/world/resources/iron-ore.png",
  "resource.animalDenEntrance": "/assets/world/animal-den-entrance.png",
  "world.mossward": "/assets/world/mossward-crossing.png",
  "world.greythorn": "/assets/world/greythorn-wood.png",
  "world.amberfen": "/assets/world/amberfen-wilds.png",
  "world.hollowVault": "/assets/world/hollow-vault.png",
  "world.sunscar": "/assets/world/sunscar-desert.png",
  "world.emeraldJungle": "/assets/world/emerald-jungle.png",
  "player.wanderer": "/assets/characters/wanderer-sprite.png",
  "wildlife.wolf": "/assets/characters/wildlife/wolf.png",
  "wildlife.fox": "/assets/characters/wildlife/fox.png",
  "wildlife.bear": "/assets/characters/wildlife/bear.png",
  "wildlife.bison": "/assets/characters/wildlife/bison.png",
  "wildlife.goat": "/assets/characters/wildlife/goat.png",
  "wildlife.turkey": "/assets/characters/wildlife/turkey.png",
  "wildlife.turtle": "/assets/characters/wildlife/turtle.png",
  "wildlife.hare": "/assets/characters/wildlife/hare.png",
} as const;

export type AssetId = keyof typeof assets;

export function getAssetPath(assetId: string): string {
  const path = assets[assetId as AssetId];
  if (!path) throw new Error(`Unknown asset id: ${assetId}`);
  return path;
}

export function getAssetEntries(): Array<[AssetId, string]> {
  return Object.entries(assets) as Array<[AssetId, string]>;
}
