export type CollisionRectangle = { x: number; y: number; width: number; height: number };
export type ZoneDefinition = {
  id: string;
  width: number;
  height: number;
  blocked: CollisionRectangle[];
};

const zones: Record<string, ZoneDefinition> = {
  mossward: {
    id: "mossward", width: 1672, height: 941,
    blocked: [
      { x: 545, y: 20, width: 400, height: 360 },
      { x: 145, y: 310, width: 480, height: 350 },
      { x: 1050, y: 310, width: 480, height: 350 },
      { x: 0, y: 600, width: 315, height: 341 },
      { x: 315, y: 760, width: 300, height: 181 },
      { x: 720, y: 475, width: 130, height: 125 }
    ]
  },
  greythorn: {
    id: "greythorn", width: 1672, height: 941,
    blocked: [
      { x: 700, y: 0, width: 270, height: 440 },
      { x: 700, y: 565, width: 270, height: 376 },
      { x: 0, y: 0, width: 175, height: 280 },
      { x: 0, y: 650, width: 260, height: 291 },
      { x: 1450, y: 0, width: 222, height: 250 },
      { x: 1450, y: 690, width: 222, height: 251 }
    ]
  },
  amberfen: {
    id: "amberfen", width: 1672, height: 941,
    blocked: [
      { x: 650, y: 80, width: 520, height: 300 },
      { x: 650, y: 640, width: 520, height: 301 },
      { x: 1160, y: 150, width: 270, height: 330 },
      { x: 0, y: 700, width: 370, height: 241 },
      { x: 1430, y: 670, width: 242, height: 271 }
    ]
  },
  hollowVault: {
    id: "hollowVault", width: 1672, height: 941,
    blocked: [
      { x: 0, y: 0, width: 185, height: 941 },
      { x: 1487, y: 0, width: 185, height: 941 },
      { x: 185, y: 0, width: 1302, height: 105 },
      { x: 185, y: 820, width: 1302, height: 121 },
      { x: 450, y: 265, width: 250, height: 190 },
      { x: 980, y: 270, width: 240, height: 170 }
    ]
  }
};

export function getZoneDefinition(zoneId: string): ZoneDefinition | undefined {
  return zones[zoneId];
}

export function isPositionWalkable(zoneId: string, x: number, y: number): boolean {
  const zone = zones[zoneId];
  if (!zone || x < 0 || y < 0 || x > zone.width || y > zone.height) return false;
  return !zone.blocked.some((rect) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height);
}
