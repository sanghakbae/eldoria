import { GameCanvas } from "./game/GameCanvas";
import { useGameConnection } from "./network/useGameConnection";
import { AuthScreen } from "./auth/AuthScreen";
import { useAuth } from "./auth/useAuth";
import { LanguageToggle, useLanguage, type TranslationKey } from "./i18n/LanguageContext";
import type { User } from "firebase/auth";
import { useEffect, useState } from "react";

const quickSlots: TranslationKey[] = ["blade", "bandage", "torch", "map"];
type PlayerPosition = { zoneId: string; x: number; y: number };
type MapPoint = { x: number; y: number };

const zoneMapBounds: Record<string, { left: number; top: number; width: number; height: number }> = {
  mossward: { left: 0, top: 81.25, width: 6.25, height: 12.5 },
  greythorn: { left: 6.25, top: 81.25, width: 6.25, height: 12.5 },
  amberfen: { left: 12.5, top: 81.25, width: 6.25, height: 12.5 },
  hollowVault: { left: 18.75, top: 81.25, width: 6.25, height: 12.5 },
};

function toMapPoint(position: PlayerPosition): MapPoint {
  const bounds = zoneMapBounds[position.zoneId] ?? zoneMapBounds.mossward!;
  return {
    x: bounds.left + (Math.max(0, Math.min(1672, position.x)) / 1672) * bounds.width,
    y: bounds.top + (Math.max(0, Math.min(941, position.y)) / 941) * bounds.height,
  };
}

function loadExploredTrail(): MapPoint[] {
  try {
    const value = JSON.parse(localStorage.getItem("eldoria.explored-trail") ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((point): point is MapPoint => typeof point === "object" && point !== null && "x" in point && "y" in point && typeof point.x === "number" && typeof point.y === "number") : [];
  } catch {
    return [];
  }
}

export function App() {
  const { language } = useLanguage();
  const session = useAuth(language);

  if (session.loading) return <main className="auth-shell"><div className="auth-sigil auth-sigil--loading">E</div></main>;
  if (!session.user) {
    return <AuthScreen error={session.error} pending={session.pending} onSignIn={session.signIn} onRegister={session.register} onGoogle={session.signInWithGoogle} />;
  }

  return <WorldScreen user={session.user} playerName={session.user.displayName ?? session.user.email?.split("@")[0] ?? "Wanderer"} onSignOut={session.signOut} />;
}

function WorldScreen({ user, playerName, onSignOut }: { user: User; playerName: string; onSignOut: () => Promise<void> }) {
  const connection = useGameConnection(user);
  const { t } = useLanguage();
  const [zoneId, setZoneId] = useState("mossward");
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition>({ zoneId: "mossward", x: 836, y: 555 });
  const [exploredTrail, setExploredTrail] = useState<MapPoint[]>(loadExploredTrail);
  const [mapOpen, setMapOpen] = useState(false);
  const [visitedZones, setVisitedZones] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem("eldoria.visited-zones") ?? '["mossward"]') as string[]));
  useEffect(() => {
    const handleZone = (event: Event) => {
      const nextZone = (event as CustomEvent<string>).detail;
      setZoneId(nextZone);
      setVisitedZones((current) => {
        const next = new Set(current).add(nextZone);
        localStorage.setItem("eldoria.visited-zones", JSON.stringify([...next]));
        return next;
      });
    };
    window.addEventListener("eldoria:zone-change", handleZone);
    const handlePosition = (event: Event) => {
      const position = (event as CustomEvent<PlayerPosition>).detail;
      if (!position) return;
      setPlayerPosition(position);
      const point = toMapPoint(position);
      setExploredTrail((current) => {
        const previous = current.at(-1);
        if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.06) return current;
        const next = [...current.slice(-1499), point];
        localStorage.setItem("eldoria.explored-trail", JSON.stringify(next));
        return next;
      });
    };
    window.addEventListener("eldoria:player-state", handlePosition);
    return () => {
      window.removeEventListener("eldoria:zone-change", handleZone);
      window.removeEventListener("eldoria:player-state", handlePosition);
    };
  }, []);
  const zoneKey = ({ mossward: "mossward", greythorn: "greythorn", amberfen: "amberfen", hollowVault: "hollowVault" } as const)[zoneId as "mossward" | "greythorn" | "amberfen" | "hollowVault"] ?? "mossward";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-rune" aria-hidden="true">E</span>
          <div>
            <p className="eyebrow">{t("frontier")}</p>
            <h1>ELDORIA</h1>
          </div>
        </div>
        <div className={`server-pill server-pill--${connection.status}`}>
          <span className="server-dot" />
          <span>{connection.label}</span>
          {connection.latency !== null && <strong>{connection.latency}ms</strong>}
          <LanguageToggle />
          <button className="signout-button" type="button" onClick={() => void onSignOut()}>{t("signOut")}</button>
        </div>
      </header>

      <section className="game-layout">
        <aside className="character-panel panel">
          <div className="portrait"><img src="/assets/characters/wanderer-portrait.png" alt="" /></div>
          <div>
            <p className="eyebrow">{t("wanderer")}</p>
            <h2>{playerName}</h2>
            <p className="location">{t(zoneKey)}</p>
          </div>
          <div className="vitals" aria-label="Character vitals">
            <Vital label={t("health")} value={84} tone="health" />
            <Vital label={t("mana")} value={61} tone="mana" />
            <Vital label={t("stamina")} value={93} tone="stamina" />
          </div>
          <div className="divider" />
          <p className="panel-label">{t("activeSkills")}</p>
          <Skill name={t("swordsmanship")} value="32.4" />
          <Skill name={t("healing")} value="18.7" />
          <Skill name={t("lumberjacking")} value="11.2" />
        </aside>

        <section className="world-frame" aria-label={t("worldAria")}>
          <GameCanvas />
          <div className="world-caption">
            <span className="compass">✦</span>
            <div>
              <strong>{t(zoneKey)}</strong>
              <small>{t(zoneId === "mossward" ? "safeSettlement" : "wildZone")}</small>
            </div>
          </div>
          <div className="world-hint">{t("clickMove")} · {t("roadHint")}</div>
          {mapOpen && <WorldMapOverlay position={playerPosition} exploredTrail={exploredTrail} visitedZones={visitedZones} onClose={() => setMapOpen(false)} />}
        </section>

        <aside className="journal-panel panel">
          <p className="eyebrow">{t("journal")}</p>
          <h2>{t("quietBeginning")}</h2>
          <p className="journal-copy">{t("meetRoadwarden")}</p>
          <div className="objective"><span>01</span><p>{t("exploreMossward")}<strong>0 / 1</strong></p></div>
          <div className="objective"><span>02</span><p>{t("findRoad")}<strong>0 / 1</strong></p></div>
          <div className="divider" />
          <p className="panel-label">{t("worldNotes")}</p>
          <p className="note">{t("wolvesNote")}</p>
        </aside>
      </section>

      <footer className="command-deck">
        <div className="chat-preview">
          <span>{t("system")}</span>
          <p>{connection.message}</p>
        </div>
        <nav className="quickbar" aria-label={t("quickActions")}>
          {quickSlots.map((slot, index) => <button key={slot} title={t(slot)} onClick={() => slot === "map" && setMapOpen(true)}><kbd>{index + 1}</kbd><QuickSlotIcon slot={slot} /><small>{t(slot)}</small></button>)}
        </nav>
        <div className="build-mark"><span>PRE-ALPHA</span><small>{t("foundation")}</small></div>
      </footer>
    </main>
  );
}

function Vital({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="vital"><div><span>{label}</span><strong>{value}</strong></div><div className="meter"><i className={`meter--${tone}`} style={{ width: `${value}%` }} /></div></div>;
}

function Skill({ name, value }: { name: string; value: string }) {
  return <div className="skill-row"><span>{name}</span><strong>{value}</strong></div>;
}

function QuickSlotIcon({ slot }: { slot: TranslationKey }) {
  if (slot === "blade") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M23 4l5 1-1 5L14 23l-5-5L23 4zM7 20l5 5-3 3-5-5 3-3z" /><path d="M11 17l7 7" /></svg>;
  if (slot === "bandage") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 11h16v10H8z" /><path d="M13 14h6v4h-6zM5 12l3-1v10l-3-1V12zm22 0l-3-1v10l3-1V12z" /></svg>;
  if (slot === "torch") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M13 14h6l-2 15h-2l-2-15z" /><path d="M16 3c5 4 4 8 0 11-4-2-5-6 0-11z" /></svg>;
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 7l8-3 8 3 8-3v21l-8 3-8-3-8 3V7z" /><path d="M12 4v21m8-18v21" /></svg>;
}

function WorldMapOverlay({ position, exploredTrail, visitedZones, onClose }: { position: PlayerPosition; exploredTrail: MapPoint[]; visitedZones: Set<string>; onClose: () => void }) {
  const { t } = useLanguage();
  const playerPoint = toMapPoint(position);
  const trail = [...exploredTrail, playerPoint];
  const trailWidth = Math.min(3.4, 2.1 + visitedZones.size * 0.18);
  return (
    <section className="world-map-overlay" aria-modal="true" role="dialog" aria-label={t("worldMap")}>
      <header>
        <div>
          <p className="eyebrow">16,384 × 16,384 · THE VERDANT FRONTIER</p>
          <h2>{t("worldMap")}</h2>
        </div>
        <button onClick={onClose} aria-label={t("close")}>×</button>
      </header>
      <div className="world-atlas">
        <svg className="atlas-fog" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <mask id="exploration-mask">
              <rect width="100" height="100" fill="white" />
              {trail.length > 1 && <polyline points={trail.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="black" strokeWidth={trailWidth} strokeLinecap="round" strokeLinejoin="round" />}
              {trail.map((point, index) => <circle key={`${index}-${point.x}-${point.y}`} cx={point.x} cy={point.y} r={trailWidth * 0.62} fill="black" />)}
              <circle cx={playerPoint.x} cy={playerPoint.y} r="3.8" fill="black" />
            </mask>
            <pattern id="fog-texture" width="5" height="5" patternUnits="userSpaceOnUse">
              <rect width="5" height="5" fill="#020706" />
              <path d="M0 5L5 0M-2 2L2-2M3 7L7 3" stroke="#17231e" strokeWidth=".35" opacity=".5" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#fog-texture)" opacity=".94" mask="url(#exploration-mask)" />
        </svg>
        <span className="atlas-undiscovered">{t("undiscovered")}</span>
        <i className="atlas-player" style={{ left: `${playerPoint.x}%`, top: `${playerPoint.y}%` }}><b /></i>
      </div>
    </section>
  );
}
