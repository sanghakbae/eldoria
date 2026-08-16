export type RuntimePlayer = {
  uid: string;
  position: { zoneId: string; x: number; y: number };
  direction: { x: number; y: number };
  sequence: number;
};

const WORLD_WIDTH = 1672;
const WORLD_HEIGHT = 941;
const MOVEMENT_SPEED = 180;

export class RuntimeWorld {
  private readonly players = new Map<string, RuntimePlayer>();

  join(uid: string): RuntimePlayer {
    const player = { uid, position: { zoneId: "mossward", x: 836, y: 555 }, direction: { x: 0, y: 0 }, sequence: 0 };
    this.players.set(uid, player);
    return player;
  }

  leave(uid: string) {
    this.players.delete(uid);
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
      player.position.x = clamp(player.position.x + player.direction.x * MOVEMENT_SPEED * deltaSeconds, 30, WORLD_WIDTH - 30);
      player.position.y = clamp(player.position.y + player.direction.y * MOVEMENT_SPEED * deltaSeconds, 45, WORLD_HEIGHT - 25);
      this.applyZoneTransition(player);
    }
    return [...this.players.values()];
  }

  private applyZoneTransition(player: RuntimePlayer) {
    if (player.position.x < 31) {
      const previous: Record<string, string | undefined> = { greythorn: "mossward", amberfen: "greythorn", hollowVault: "amberfen" };
      const zoneId = previous[player.position.zoneId];
      if (zoneId) player.position = { zoneId, x: WORLD_WIDTH - 35, y: player.position.y };
    } else if (player.position.x > WORLD_WIDTH - 31) {
      const next: Record<string, string | undefined> = { mossward: "greythorn", greythorn: "amberfen", amberfen: "hollowVault" };
      const zoneId = next[player.position.zoneId];
      if (zoneId) player.position = { zoneId, x: 35, y: player.position.y };
    }
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
