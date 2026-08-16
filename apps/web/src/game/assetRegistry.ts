const assets = {
  "world.untamedWilds": "/assets/world/untamed-wilds.png",
  "world.mossward": "/assets/world/mossward-crossing.png",
  "world.greythorn": "/assets/world/greythorn-wood.png",
  "world.amberfen": "/assets/world/amberfen-wilds.png",
  "world.hollowVault": "/assets/world/hollow-vault.png",
  "player.wanderer": "/assets/characters/wanderer-sprite.png",
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
