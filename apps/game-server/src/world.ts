import { getZoneDefinition, isPositionWalkable } from "@eldoria/game-data";

export type RuntimePlayer = {
  uid: string;
  position: { zoneId: string; x: number; y: number };
  direction: { x: number; y: number };
  sequence: number;
};

const MOVEMENT_SPEED = 96;

export class RuntimeWorld {
  private readonly players = new Map<string, RuntimePlayer>();

  join(uid: string, position = { zoneId: "untamedWilds", x: 836, y: 470 }): RuntimePlayer {
    const zone = getZoneDefinition(position.zoneId);
    const safePosition = zone && isPositionWalkable(position.zoneId, position.x, position.y)
      ? position
      : getSafeSpawn("untamedWilds");
    const player = { uid, position: { ...safePosition }, direction: { x: 0, y: 0 }, sequence: 0 };
    this.players.set(uid, player);
    return player;
  }

  leave(uid: string) {
    this.players.delete(uid);
  }

  get(uid: string): RuntimePlayer | undefined {
    return this.players.get(uid);
  }

  setDirection(uid: string, direction: { x: number; y: number }, sequence: number) {
    const player = this.players.get(uid);
    if (!player || sequence <= player.sequence) return;
    const magnitude = Math.hypot(direction.x, direction.y);
    player.direction = magnitude > 1 ? { x: direction.x / magnitude, y: direction.y / magnitude } : direction;
    player.sequence = sequence;
  }

  tick(deltaSeconds: number): RuntimePlayer[] {
    for (const player of this.players.values()) {
      const zone = getZoneDefinition(player.position.zoneId);
      if (!zone) continue;
      const nextX = clamp(player.position.x + player.direction.x * MOVEMENT_SPEED * deltaSeconds, 30, zone.width - 30);
      const nextY = clamp(player.position.y + player.direction.y * MOVEMENT_SPEED * deltaSeconds, 45, zone.height - 25);
      if (isPositionWalkable(player.position.zoneId, nextX, nextY)) {
        player.position.x = nextX;
        player.position.y = nextY;
      } else if (isPositionWalkable(player.position.zoneId, nextX, player.position.y)) {
        player.position.x = nextX;
      } else if (isPositionWalkable(player.position.zoneId, player.position.x, nextY)) {
        player.position.y = nextY;
      }
      this.applyZoneTransition(player);
    }
    return [...this.players.values()];
  }

  private applyZoneTransition(player: RuntimePlayer) {
    const zone = getZoneDefinition(player.position.zoneId);
    if (!zone) return;
    const edge = player.position.x < 31 ? "west" : player.position.x > zone.width - 31 ? "east" : null;
    if (!edge) return;
    const exit = zone.exits.find((candidate) => candidate.edge === edge);
    const destination = exit ? getZoneDefinition(exit.toZoneId) : undefined;
    const spawn = destination?.layers.spawn.find((candidate) => candidate.id === exit?.toSpawnId);
    if (exit && spawn) player.position = { zoneId: exit.toZoneId, x: spawn.x, y: spawn.y };
  }
}

function getSafeSpawn(zoneId: string) {
  const zone = getZoneDefinition(zoneId);
  const spawn = zone?.layers.spawn.find((candidate) => candidate.id === "arrival") ?? zone?.layers.spawn[0];
  return { zoneId, x: spawn?.x ?? 900, y: spawn?.y ?? 700 };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
