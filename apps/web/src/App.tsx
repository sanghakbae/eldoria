import { GameCanvas } from "./game/GameCanvas";
import { useGameConnection, type GameConnection } from "./network/useGameConnection";
import { AuthScreen } from "./auth/AuthScreen";
import { useAuth } from "./auth/useAuth";
import { LanguageToggle, useLanguage, type TranslationKey } from "./i18n/LanguageContext";
import type { User } from "firebase/auth";
import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { evaluateBodyConditions, type BodyCondition } from "@eldoria/game-data";
import type { CharacterSummary } from "@eldoria/game-protocol";
import { AdminSkillSettings } from "./admin/AdminSkillSettings";

const quickSlots: TranslationKey[] = ["fists", "gather", "fire", "map"];
const zoneTranslationKeys: Record<string, TranslationKey> = { untamedWilds: "untamedWilds", animalDen: "animalDen", mossward: "mossward", greythorn: "greythorn", amberfen: "amberfen", hollowVault: "hollowVault" };
type PlayerPosition = { zoneId: string; x: number; y: number };
type MapPoint = { x: number; y: number };

const zoneMapBounds: Record<string, { left: number; top: number; width: number; height: number }> = {
  mossward: { left: 47.328, top: 60, width: 0.836, height: 0.7842 },
  untamedWilds: { left: 48.164, top: 60, width: 0.836, height: 0.7842 },
  greythorn: { left: 49, top: 60, width: 0.836, height: 0.7842 },
  amberfen: { left: 49.836, top: 60, width: 0.836, height: 0.7842 },
  hollowVault: { left: 50.672, top: 60, width: 0.836, height: 0.7842 },
};

const zoneMapImages: Record<string, string> = {
  untamedWilds: "/assets/world/untamed-wilds.png",
  mossward: "/assets/world/mossward-crossing.png",
  greythorn: "/assets/world/greythorn-wood.png",
  amberfen: "/assets/world/amberfen-wilds.png",
  hollowVault: "/assets/world/hollow-vault.png",
};

function toMapPoint(position: PlayerPosition): MapPoint {
  if (position.zoneId === "animalDen") return toMapPoint({ zoneId: "untamedWilds", x: 385, y: 175 });
  const bounds = zoneMapBounds[position.zoneId] ?? zoneMapBounds.mossward!;
  return {
    x: bounds.left + (Math.max(0, Math.min(1672, position.x)) / 1672) * bounds.width,
    y: bounds.top + (Math.max(0, Math.min(941, position.y)) / 941) * bounds.height,
  };
}

function loadExploredTrail(): MapPoint[] {
  try {
    const value = JSON.parse(localStorage.getItem("eldoria.explored-trail.v2") ?? "[]") as unknown;
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

  return <AuthenticatedApp user={session.user} isAdmin={session.admin} onSignOut={session.signOut} />;
}

function AuthenticatedApp({ user, isAdmin, onSignOut }: { user: User; isAdmin: boolean; onSignOut: () => Promise<void> }) {
  if (isAdmin && new URLSearchParams(window.location.search).get("admin") === "skills") return <AdminSkillSettings user={user} onExit={() => { window.location.href = "/"; }} />;
  return <GameSession user={user} isAdmin={isAdmin} onSignOut={onSignOut} />;
}

function GameSession({ user, isAdmin, onSignOut }: { user: User; isAdmin: boolean; onSignOut: () => Promise<void> }) {
  const connection = useGameConnection(user);
  if (!connection.selectedCharacter) return <CharacterScreen connection={connection} isAdmin={isAdmin} onSignOut={onSignOut} />;
  return <WorldScreen connection={connection} character={connection.selectedCharacter} isAdmin={isAdmin} onSignOut={onSignOut} />;
}

function WorldScreen({ connection, character, isAdmin, onSignOut }: { connection: GameConnection; character: CharacterSummary; isAdmin: boolean; onSignOut: () => Promise<void> }) {
  const { t, language } = useLanguage();
  const bodyConditions = evaluateBodyConditions(character.survival.nutrition);
  const [zoneId, setZoneId] = useState("untamedWilds");
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition>({ zoneId: "untamedWilds", x: 836, y: 470 });
  const [exploredTrail, setExploredTrail] = useState<MapPoint[]>(loadExploredTrail);
  const [mapOpen, setMapOpen] = useState(false);
  const [visitedZones, setVisitedZones] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem("eldoria.visited-zones") ?? '["untamedWilds"]') as string[]));
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
        localStorage.setItem("eldoria.explored-trail.v2", JSON.stringify(next));
        return next;
      });
    };
    window.addEventListener("eldoria:player-state", handlePosition);
    return () => {
      window.removeEventListener("eldoria:zone-change", handleZone);
      window.removeEventListener("eldoria:player-state", handlePosition);
    };
  }, []);
  const zoneKey = zoneTranslationKeys[zoneId] ?? "mossward";

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
          {isAdmin && <button className="signout-button" type="button" onClick={() => { window.location.search = "?admin=skills"; }}>ADMIN</button>}
          <button className="signout-button" type="button" onClick={() => void onSignOut()}>{t("signOut")}</button>
        </div>
      </header>

      <section className="game-layout">
        <aside className="character-panel panel">
          <div className="portrait"><img src={character.gender === "female" ? "/assets/characters/female-wanderer-portrait.png" : "/assets/characters/wanderer-portrait.png"} alt="" /></div>
          <div>
            <p className="eyebrow">{t("wanderer")}</p>
            <h2>{character.name}</h2>
            <p className="location">{t(zoneKey)}</p>
          </div>
          <div className="vitals" aria-label="Character vitals">
            <Vital label={t("health")} value={84} tone="health" />
            <Vital label={t("mana")} value={61} tone="mana" />
            <Vital label={t("stamina")} value={93} tone="stamina" />
          </div>
          <div className="divider" />
          <p className="panel-label">{t("bodyCondition")}</p>
          <div className={`body-condition ${bodyConditions.length === 0 ? "body-condition--healthy" : "body-condition--warning"}`}>
            <BodyConditionFigure conditions={bodyConditions} />
            <div>
              {bodyConditions.length === 0 && <><strong>{t("wholeBodyHealthy")}</strong><small>{t("nutritionBalanced")}</small></>}
              {bodyConditions.slice(0, 3).map((condition) => <span key={condition.id}><strong>{condition.name[language]}</strong><small>{condition.effect[language]}</small></span>)}
            </div>
          </div>
          <div className="divider" />
          <p className="panel-label">{t("activeSkills")}</p>
          <Skill name={t("fishing")} value={(character.survival.skills?.fishing?.value ?? 0).toFixed(3)} />
          <Skill name={t("foraging")} value={(character.survival.skills?.foraging?.value ?? 0).toFixed(3)} />
          <Skill name={t("materialProcessing")} value={(character.survival.skills?.materialProcessing?.value ?? 0).toFixed(3)} />
          <div className="divider" />
          <p className="panel-label">{t("inventory")}</p>
          {(character.survival.inventory ?? []).slice(0, 5).map((item) => <div className="inventory-row" key={item.itemId}><span>{item.itemId}</span><strong>× {item.quantity}</strong></div>)}
        </aside>

        <section className="world-frame" aria-label={t("worldAria")}>
          <GameCanvas gender={character.gender} />
          <div className="world-caption">
            <span className="compass">✦</span>
            <div>
              <strong>{t(zoneKey)}</strong>
              <small>{t(zoneId === "mossward" ? "safeSettlement" : "wildZone")}</small>
            </div>
          </div>
          <div className="world-hint">{t("clickMove")} · {t("wheelZoom")} · {t("roadHint")}</div>
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

const bodyRegionPoints: Record<string, Array<[number, number]>> = {
  blood: [[50, 45]],
  eyes: [[50, 15]],
  gumsSkin: [[50, 22]],
  bonesMuscles: [[50, 52], [35, 73], [65, 73]],
  muscles: [[30, 45], [70, 45]],
  nervousSystem: [[50, 34]],
  thyroid: [[50, 28]],
  kidneysBrain: [[50, 12], [43, 52], [57, 52]],
};

function BodyConditionFigure({ conditions }: { conditions: BodyCondition[] }) {
  const markers = conditions.flatMap((condition) => (bodyRegionPoints[condition.region] ?? [[50, 45]]).map(([x, y]) => ({ x, y, severity: condition.severity, id: condition.id })));
  return (
    <svg className="body-condition-figure" viewBox="0 0 100 120" role="img" aria-label={conditions.length === 0 ? "Healthy body" : conditions.map((condition) => condition.name.en).join(", ")}>
      <circle className="body-head" cx="50" cy="15" r="10" />
      <path className="body-silhouette" d="M40 29 Q50 25 60 29 L68 56 L61 62 L58 108 L49 108 L46 69 L42 108 L33 108 L38 62 L31 56 Z" />
      <path className="body-limbs" d="M39 31 L24 61 M61 31 L76 61 M42 67 L35 111 M51 67 L60 111" />
      {markers.map((marker, index) => <circle key={`${marker.id}-${index}`} className={`body-marker body-marker--${marker.severity}`} cx={marker.x} cy={marker.y} r="6" />)}
    </svg>
  );
}

function CharacterScreen({ connection, isAdmin, onSignOut }: { connection: GameConnection; isAdmin: boolean; onSignOut: () => Promise<void> }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"female" | "male" | "">("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !gender) return;
    connection.createCharacter(name, gender);
    setName("");
    setGender("");
  };

  return (
    <main className="character-shell">
      <section className="character-select-card">
        <div className="character-select-header">
          <div><p className="eyebrow">{t("frontier")}</p><h1>ELDORIA</h1></div>
          <div><LanguageToggle />{isAdmin && <button className="signout-button" onClick={() => { window.location.search = "?admin=skills"; }}>ADMIN</button>}<button className="signout-button" onClick={() => void onSignOut()}>{t("signOut")}</button></div>
        </div>
        <div className="character-select-title"><p className="eyebrow">{t("characterArchive")}</p><h2>{t("chooseCharacter")}</h2><p>{t("characterPersistence")}</p></div>
        <div className="character-list">
          {!connection.charactersReady && <p className="character-empty">{t("loadingCharacters")}</p>}
          {connection.charactersReady && connection.characters.length === 0 && <p className="character-empty">{t("noCharacters")}</p>}
          {connection.characters.map((character) => (
            <button key={character.id} className="character-entry" onClick={() => connection.selectCharacter(character.id)}>
              <img src="/assets/characters/wanderer-portrait.png" alt="" />
              <span><strong>{character.name}</strong><small>{t("lastLocation")}: {t(zoneTranslationKeys[character.position.zoneId] ?? "mossward")}</small></span>
              <b>{t("enterWorld")} →</b>
            </button>
          ))}
        </div>
        {connection.characters.length < 5 && <form className="character-create" onSubmit={submit}><label>{t("newCharacterName")}<input value={name} minLength={2} maxLength={20} onChange={(event) => setName(event.target.value)} placeholder={t("characterNamePlaceholder")} required /></label><fieldset className="gender-choice"><legend>{t("characterGender")}</legend><label><input type="radio" name="gender" value="female" checked={gender === "female"} onChange={() => setGender("female")} required />{t("female")}</label><label><input type="radio" name="gender" value="male" checked={gender === "male"} onChange={() => setGender("male")} required />{t("male")}</label></fieldset><button type="submit" disabled={connection.status !== "online" || !gender}>{t("createCharacter")}</button></form>}
        <p className="character-status">{connection.message}</p>
      </section>
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
  if (slot === "fists") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 14V8a2 2 0 014 0v5-7a2 2 0 014 0v7-6a2 2 0 014 0v7-4a2 2 0 014 0v8c0 6-4 10-10 10-5 0-8-3-9-8l-1-5a2 2 0 014-1l2 4v-4a2 2 0 014 0z" /></svg>;
  if (slot === "gather") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 27V13M16 18c-6 0-9-4-9-9 6 0 9 3 9 9zm0-4c5 0 8-3 8-8-5 0-8 3-8 8z" /></svg>;
  if (slot === "fire") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3c7 7 9 12 6 19-2 5-10 7-15 2-5-5-2-11 2-15 0 5 2 7 4 7-2-6 1-9 3-13zm0 13c4 4 3 9 0 11-4-1-5-6 0-11z" /></svg>;
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 7l8-3 8 3 8-3v21l-8 3-8-3-8 3V7z" /><path d="M12 4v21m8-18v21" /></svg>;
}

function WorldMapOverlay({ position, exploredTrail, visitedZones, onClose }: { position: PlayerPosition; exploredTrail: MapPoint[]; visitedZones: Set<string>; onClose: () => void }) {
  const { t } = useLanguage();
  const [mapScale, setMapScale] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const playerPoint = toMapPoint(position);
  const trail = [...exploredTrail, playerPoint];
  const trailWidth = Math.min(0.18, 0.1 + visitedZones.size * 0.012);
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, y: event.clientY, panX: mapPan.x, panY: mapPan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setMapPan({ x: drag.current.panX + event.clientX - drag.current.x, y: drag.current.panY + event.clientY - drag.current.y });
  };
  const zoomMap = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setMapScale((current) => Math.max(1, Math.min(14, current * (event.deltaY < 0 ? 1.18 : 1 / 1.18))));
  };
  return (
    <section className="world-map-overlay" aria-modal="true" role="dialog" aria-label={t("worldMap")}>
      <header>
        <div>
          <p className="eyebrow">16,384 × 16,384 · THE VERDANT FRONTIER</p>
          <h2>{t("worldMap")}</h2>
        </div>
        <button onClick={onClose} aria-label={t("close")}>×</button>
      </header>
      <div className="world-atlas" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onWheel={zoomMap} onDoubleClick={() => { setMapPan({ x: 0, y: 0 }); setMapScale(1); }}>
        <div className="atlas-world-plane" style={{ transform: `translate(calc(-50% + ${mapPan.x}px), calc(-50% + ${mapPan.y}px)) scale(${mapScale})` }}>
          {Object.entries(zoneMapBounds).map(([zoneId, bounds]) => (
            <div
              key={zoneId}
              className="atlas-zone"
              style={{ left: `${bounds.left}%`, top: `${bounds.top}%`, width: `${bounds.width}%`, height: `${bounds.height}%`, backgroundImage: `url(${zoneMapImages[zoneId]})` }}
            />
          ))}
          <svg className="atlas-fog" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <mask id="exploration-mask">
                <rect width="100" height="100" fill="white" />
                {trail.length > 1 && <polyline points={trail.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="black" strokeWidth={trailWidth} strokeLinecap="round" strokeLinejoin="round" />}
                {trail.map((point, index) => <circle key={`${index}-${point.x}-${point.y}`} cx={point.x} cy={point.y} r={trailWidth * 0.62} fill="black" />)}
                <circle cx={playerPoint.x} cy={playerPoint.y} r="0.32" fill="black" />
              </mask>
              <pattern id="fog-texture" width="5" height="5" patternUnits="userSpaceOnUse">
                <rect width="5" height="5" fill="#020706" />
                <path d="M0 5L5 0M-2 2L2-2M3 7L7 3" stroke="#17231e" strokeWidth=".35" opacity=".5" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#fog-texture)" opacity=".94" mask="url(#exploration-mask)" />
          </svg>
          <i className="atlas-player" style={{ left: `${playerPoint.x}%`, top: `${playerPoint.y}%` }}><b /></i>
        </div>
        <span className="atlas-undiscovered">{t("undiscovered")}</span>
      </div>
    </section>
  );
}
