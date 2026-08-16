import { GameCanvas } from "./game/GameCanvas";
import { useGameConnection, type GameConnection } from "./network/useGameConnection";
import { AuthScreen } from "./auth/AuthScreen";
import { useAuth } from "./auth/useAuth";
import { LanguageToggle, useLanguage, type TranslationKey } from "./i18n/LanguageContext";
import type { User } from "firebase/auth";
import { useEffect, useState, type FormEvent } from "react";
import { craftingRecipes, defaultSkillProgression, evaluateBodyConditions, findTool, foodCatalog, getZoneDefinition, skillCategories, skillSystemDefinition, toolDefinitions, worldDefinition, type BodyCondition } from "@eldoria/game-data";
import type { CharacterSummary, SkillLock } from "@eldoria/game-protocol";
// One life per account, so the create form disappears once that wanderer exists.
const MAX_CHARACTERS_PER_ACCOUNT = 1;
import { AdminSkillSettings } from "./admin/AdminSkillSettings";
import { itemDisplayName } from "./game/itemNames";

const quickSlots: TranslationKey[] = ["fists", "crafting", "fire", "map", "skills", "inventory"];
const foodNames = new Map(foodCatalog.map((food) => [food.id, food.name]));
const skillLocks: SkillLock[] = ["up", "down", "locked"];
const lockLabels: Record<SkillLock, TranslationKey> = { up: "lockRaise", down: "lockLower", locked: "lockHold" };
const lockGlyphs: Record<SkillLock, string> = { up: "↑", down: "↓", locked: "🔒" };
const zoneTranslationKeys: Record<string, TranslationKey> = { untamedWilds: "untamedWilds", animalDen: "animalDen", mossward: "mossward", greythorn: "greythorn", amberfen: "amberfen", hollowVault: "hollowVault" };
type PlayerPosition = { zoneId: string; x: number; y: number };
type MapPoint = { x: number; y: number };

// The atlas viewBox is 100x100 stretched over a 5:3 sheet, so a zone's on-sheet height is derived
// from its width rather than written down: the same ratio that keeps the terrain art undistorted.
const ZONE_WIDTH = 1672;
const ZONE_HEIGHT = 941;
/**
 * The sheet is the whole frontier, not just the part that exists yet. Five zones are built; they sit
 * in the middle of a 16,384 square world, which is why the walked ground reads as the small corner it
 * actually is. Everything is expressed as a percentage of that square.
 */
const WORLD_EXTENT = 16_384;
type ZoneBounds = { left: number; top: number; width: number; height: number };
let atlasLayoutCache: { bounds: Record<string, ZoneBounds>; sightRx: number; sightRy: number } | null = null;

function atlasLayout() {
  if (atlasLayoutCache) return atlasLayoutCache;
  const order = orderZonesWestToEast();
  const width = (ZONE_WIDTH / WORLD_EXTENT) * 100;
  const height = (ZONE_HEIGHT / WORLD_EXTENT) * 100;
  const left = (100 - width * order.length) / 2;
  const top = (100 - height) / 2;
  atlasLayoutCache = {
    bounds: Object.fromEntries(order.map((zoneId, index) => [zoneId, { left: left + index * width, top, width, height }])),
    sightRx: (SIGHT_RADIUS / ZONE_WIDTH) * width,
    sightRy: (SIGHT_RADIUS / ZONE_HEIGHT) * height,
  };
  return atlasLayoutCache;
}

/** Walks the world's own exits so the atlas cannot drift out of step with where the zones actually connect. */
function orderZonesWestToEast(): string[] {
  const surface = worldDefinition.zones.filter((zone) => zone.exits.length > 0);
  let head = surface.find((zone) => !zone.exits.some((exit) => exit.edge === "west")) ?? surface[0];
  const ordered: string[] = [];
  while (head && !ordered.includes(head.id)) {
    ordered.push(head.id);
    const east = head.exits.find((exit) => exit.edge === "east");
    head = east ? surface.find((zone) => zone.id === east.toZoneId) : undefined;
  }
  return ordered;
}

const zoneMapImages: Record<string, string> = {
  untamedWilds: "/assets/world/untamed-wilds.png",
  mossward: "/assets/world/mossward-crossing.png",
  greythorn: "/assets/world/greythorn-wood.png",
  amberfen: "/assets/world/amberfen-wilds.png",
  hollowVault: "/assets/world/hollow-vault.png",
};

// How far the wanderer can take in the ground around them, in zone pixels. The atlas viewBox is
// 100x100 stretched over a 5:3 plane, so this circle on the ground becomes an ellipse on the sheet.
const SIGHT_RADIUS = 240;
// Interiors are not part of the surface atlas, so walking one reveals nothing outdoors.
const INTERIOR_ZONES: Record<string, PlayerPosition> = { animalDen: { zoneId: "untamedWilds", x: 385, y: 300 } };
const TRAIL_STORAGE_KEY = "eldoria.explored-trail.v3";

function toSurfacePosition(position: PlayerPosition): PlayerPosition {
  return INTERIOR_ZONES[position.zoneId] ?? position;
}

function toMapPoint(position: PlayerPosition): MapPoint {
  const surface = toSurfacePosition(position);
  const { bounds: allBounds } = atlasLayout();
  const bounds = allBounds[surface.zoneId] ?? Object.values(allBounds)[0]!;
  return {
    x: bounds.left + (Math.max(0, Math.min(ZONE_WIDTH, surface.x)) / ZONE_WIDTH) * bounds.width,
    y: bounds.top + (Math.max(0, Math.min(ZONE_HEIGHT, surface.y)) / ZONE_HEIGHT) * bounds.height,
  };
}

function loadExploredTrail(): PlayerPosition[] {
  try {
    const value = JSON.parse(localStorage.getItem(TRAIL_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter(isPlayerPosition) : [];
  } catch {
    return [];
  }
}

function isPlayerPosition(value: unknown): value is PlayerPosition {
  return typeof value === "object" && value !== null && "zoneId" in value && "x" in value && "y" in value
    && typeof (value as PlayerPosition).zoneId === "string" && typeof (value as PlayerPosition).x === "number" && typeof (value as PlayerPosition).y === "number";
}

export function App() {
  const { language } = useLanguage();
  const session = useAuth(language);

  if (session.loading) return <main className="auth-shell"><div className="auth-sigil auth-sigil--loading">E</div></main>;
  if (!session.user) {
    return <AuthScreen error={session.error} pending={session.pending} onGoogle={session.signInWithGoogle} />;
  }

  return <AuthenticatedApp user={session.user} isAdmin={session.admin} onSignOut={session.signOut} />;
}

function AuthenticatedApp({ user, isAdmin, onSignOut }: { user: User; isAdmin: boolean; onSignOut: () => Promise<void> }) {
  if (isAdmin && new URLSearchParams(window.location.search).get("admin") === "skills") return <AdminSkillSettings user={user} onExit={() => { window.location.href = "/"; }} />;
  return <GameSession user={user} isAdmin={isAdmin} onSignOut={onSignOut} />;
}

function GameSession({ user, isAdmin, onSignOut }: { user: User; isAdmin: boolean; onSignOut: () => Promise<void> }) {
  const connection = useGameConnection(user);
  const { selectedCharacter, characters, charactersReady, selectCharacter } = connection;
  const onlyCharacterId = characters.length === 1 ? characters[0]!.id : null;

  // With one wanderer per account there is nothing to choose between, so the account walks straight in.
  useEffect(() => {
    if (!selectedCharacter && onlyCharacterId) selectCharacter(onlyCharacterId);
  }, [selectedCharacter, onlyCharacterId, selectCharacter]);

  if (selectedCharacter) return <WorldScreen connection={connection} character={selectedCharacter} isAdmin={isAdmin} onSignOut={onSignOut} />;
  if (!charactersReady || onlyCharacterId) return <main className="auth-shell"><div className="auth-sigil auth-sigil--loading">E</div></main>;
  return <CharacterScreen connection={connection} isAdmin={isAdmin} onSignOut={onSignOut} />;
}

function WorldScreen({ connection, character, isAdmin, onSignOut }: { connection: GameConnection; character: CharacterSummary; isAdmin: boolean; onSignOut: () => Promise<void> }) {
  const { t, language } = useLanguage();
  const bodyConditions = evaluateBodyConditions(character.survival.nutrition);
  const [zoneId, setZoneId] = useState("untamedWilds");
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition>({ zoneId: "untamedWilds", x: 836, y: 470 });
  const [exploredTrail, setExploredTrail] = useState<PlayerPosition[]>(loadExploredTrail);
  const [mapOpen, setMapOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [craftingOpen, setCraftingOpen] = useState(false);
  const [visitedZones, setVisitedZones] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem("eldoria.visited-zones") ?? '["untamedWilds"]') as string[]));
  useEffect(() => {
    const handlePanels = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLowerCase() === "i" || event.key === "6") {
        event.preventDefault();
        setInventoryOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setInventoryOpen(false);
        setCraftingOpen(false);
        setSkillsOpen(false);
        setMapOpen(false);
      }
    };
    window.addEventListener("keydown", handlePanels);
    return () => window.removeEventListener("keydown", handlePanels);
  }, []);
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
      // Interiors sit off the surface atlas; entering one must not carve open the ground above it.
      if (INTERIOR_ZONES[position.zoneId]) return;
      setExploredTrail((current) => {
        const previous = current.at(-1);
        // Record in zone pixels and closer together than the sight radius, so the revealed
        // shapes overlap into exactly the ground the wanderer actually walked.
        if (previous && previous.zoneId === position.zoneId && Math.hypot(position.x - previous.x, position.y - previous.y) < SIGHT_RADIUS * 0.45) return current;
        const next = [...current.slice(-2999), { zoneId: position.zoneId, x: position.x, y: position.y }];
        localStorage.setItem(TRAIL_STORAGE_KEY, JSON.stringify(next));
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
            <Vital label={t("health")} value={Math.round(((character.survival.health?.current ?? 100) / (character.survival.health?.maximum ?? 100)) * 100)} tone="health" />
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
          <button type="button" className="panel-inventory-button" onClick={() => setInventoryOpen(true)}>
            <span>{t("inventory")}</span><kbd>I</kbd>
          </button>
          {(character.survival.inventory ?? []).slice(0, 5).map((item) => <div className="inventory-row" key={item.itemId}><span>{itemDisplayName(item.itemId, language)}</span><strong>× {item.quantity}</strong></div>)}
        </aside>

        <section className="world-frame" aria-label={t("worldAria")}>
          <GameCanvas gender={character.gender} language={language} equipped={character.survival.equipment?.mainHand ?? character.survival.equipped ?? null} equipment={character.survival.equipment ?? {}} />
          <button type="button" className="inventory-toggle" onClick={() => setInventoryOpen(true)} aria-label={t("inventory")}>
            <QuickSlotIcon slot="inventory" /><span>{t("inventory")}</span><kbd>I</kbd>
          </button>
          <div className="world-caption">
            <span className="compass">✦</span>
            <div>
              <strong>{t(zoneKey)}</strong>
              <small>{t(zoneId === "mossward" ? "safeSettlement" : "wildZone")}</small>
            </div>
          </div>
          <div className="world-hint">{t("clickMove")} · {t("wheelZoom")} · {t("roadHint")}</div>
          {mapOpen && <WorldMapOverlay position={playerPosition} exploredTrail={exploredTrail} onClose={() => setMapOpen(false)} />}
          {skillsOpen && <SkillCodexOverlay character={character} onSetLock={connection.setSkillLock} onClose={() => setSkillsOpen(false)} />}
          {inventoryOpen && <InventoryOverlay character={character} onEat={connection.eatItem} onEquip={connection.equipItem} onClose={() => setInventoryOpen(false)} />}
          {craftingOpen && <CraftingOverlay character={character} lastCraft={connection.lastCraft} onCraft={connection.craft} onClose={() => setCraftingOpen(false)} />}
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
          {connection.lastOutcome && (
            <em className={`action-outcome action-outcome--${connection.lastOutcome.success ? "success" : "failure"}`}>
              {t(connection.lastOutcome.success ? "succeeded" : "failed")} · {t("chanceLabel")} {Math.round(connection.lastOutcome.chance * 100)}%
              {connection.lastOutcome.gain > 0 && <b>+{connection.lastOutcome.gain.toFixed(3)}</b>}
            </em>
          )}
        </div>
        <nav className="quickbar" aria-label={t("quickActions")}>
          {quickSlots.map((slot, index) => <button key={slot} title={t(slot)} onClick={() => { if (slot === "map") setMapOpen(true); if (slot === "skills") setSkillsOpen(true); if (slot === "inventory") setInventoryOpen(true); if (slot === "crafting") setCraftingOpen(true); }}><kbd>{index + 1}</kbd><QuickSlotIcon slot={slot} /><small>{t(slot)}</small></button>)}
        </nav>
        <div className="build-mark"><span>PRE-ALPHA</span><small>{t("foundation")}</small></div>
      </footer>
    </main>
  );
}

const bodyRegionPoints: Record<string, Array<[number, number]>> = {
  blood: [[50, 52]],
  eyes: [[46, 17], [54, 17]],
  gumsSkin: [[50, 25]],
  bonesMuscles: [[34, 58], [66, 58], [42, 92]],
  muscles: [[30, 52], [70, 52]],
  nervousSystem: [[50, 14]],
  thyroid: [[50, 31]],
  kidneysBrain: [[50, 14], [42, 62], [58, 62]],
};

/** A standing human read at a glance, with the affected organs marked on it. */
function BodyConditionFigure({ conditions }: { conditions: BodyCondition[] }) {
  const markers = conditions.flatMap((condition) => (bodyRegionPoints[condition.region] ?? [[50, 52]]).map(([x, y]) => ({ x, y, severity: condition.severity, id: condition.id })));
  return (
    <svg className="body-condition-figure" viewBox="0 0 100 130" role="img" aria-label={conditions.length === 0 ? "Healthy body" : conditions.map((condition) => condition.name.en).join(", ")}>
      <path className="body-silhouette" d="M50 6c-5.4 0-9.4 4.2-9.4 9.6 0 3.6 1.6 6.6 4 8.4-6.4 1.8-11 5.4-12.8 10.6l-5.6 17c-.8 2.4.4 4.8 2.8 5.6 2.4.8 4.8-.5 5.6-2.9l3.6-11v13.5c0 2 .3 3.4.8 5l2.4 7.6-3.2 30.4c-.3 2.8 1.7 5.2 4.5 5.5 2.8.3 5.2-1.7 5.5-4.5l3-27.4h2.4l3 27.4c.3 2.8 2.7 4.8 5.5 4.5 2.8-.3 4.8-2.7 4.5-5.5l-3.2-30.4 2.4-7.6c.5-1.6.8-3 .8-5V48.3l3.6 11c.8 2.4 3.2 3.7 5.6 2.9 2.4-.8 3.6-3.2 2.8-5.6l-5.6-17c-1.8-5.2-6.4-8.8-12.8-10.6 2.4-1.8 4-4.8 4-8.4C59.4 10.2 55.4 6 50 6z" />
      {markers.map((marker, index) => <circle key={`${marker.id}-${index}`} className={`body-marker body-marker--${marker.severity}`} cx={marker.x} cy={marker.y} r="5.5" />)}
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
        <div className="character-select-title"><p className="eyebrow">{t("characterArchive")}</p><h2>{t("newWanderer")}</h2><p>{t("oneWandererOnly")}</p></div>
        {connection.characters.length < MAX_CHARACTERS_PER_ACCOUNT && <form className="character-create" onSubmit={submit}><label>{t("newCharacterName")}<input value={name} minLength={2} maxLength={20} onChange={(event) => setName(event.target.value)} placeholder={t("characterNamePlaceholder")} required /></label><fieldset className="gender-choice"><legend>{t("characterGender")}</legend><label><input type="radio" name="gender" value="female" checked={gender === "female"} onChange={() => setGender("female")} required />{t("female")}</label><label><input type="radio" name="gender" value="male" checked={gender === "male"} onChange={() => setGender("male")} required />{t("male")}</label></fieldset><button type="submit" disabled={connection.status !== "online" || !gender}>{t("createCharacter")}</button></form>}
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
  if (slot === "skills") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 27V5h13l9 9v13z" /><path d="M10 12h8M10 17h12M10 22h12" /></svg>;
  if (slot === "crafting") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 25l9-9M20 5l7 7-4 4-7-7z" /><path d="M16 16l-4-4-5 9 9-5z" /></svg>;
  if (slot === "inventory") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 11h22v16H5z" /><path d="M11 11V7a5 5 0 0110 0v4" /><path d="M5 17h22" /></svg>;
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 7l8-3 8 3 8-3v21l-8 3-8-3-8 3V7z" /><path d="M12 4v21m8-18v21" /></svg>;
}

/** Each fruit is drawn to its own outline: a pear is not an apple with a different fill. */
const fruitShapes: Record<string, { fill: string; body: string }> = {
  "fruit.pear": { fill: "#b7c25a", body: "M16 27.5c-4.1 0-6.8-3-6.8-6.7 0-3.1 2.1-4.8 3.3-6.9 1-1.8 1.4-3.5 1.4-5.4h4.2c0 1.9.4 3.6 1.4 5.4 1.2 2.1 3.3 3.8 3.3 6.9 0 3.7-2.7 6.7-6.8 6.7z" },
  "fruit.apple": { fill: "#c0392b", body: "M16 10.5c5.1 0 9 3.7 9 8.7 0 4.7-3.9 8.4-9 8.4s-9-3.7-9-8.4c0-5 3.9-8.7 9-8.7z" },
  "fruit.peach": { fill: "#e08a52", body: "M16 10.5c5.1 0 9 3.7 9 8.7 0 4.7-3.9 8.4-9 8.4s-9-3.7-9-8.4c0-5 3.9-8.7 9-8.7z" },
  "fruit.tangerine": { fill: "#e08a2a", body: "M16 11.5c4.7 0 8.4 3.4 8.4 7.9s-3.7 8-8.4 8-8.4-3.5-8.4-8 3.7-7.9 8.4-7.9z" },
  "fruit.persimmon": { fill: "#d2601a", body: "M16 12.5c5.3 0 9 3 9 7.2 0 4.2-3.7 7.3-9 7.3s-9-3.1-9-7.3c0-4.2 3.7-7.2 9-7.2z" },
  "fruit.crabapple": { fill: "#a63a2f", body: "M16 12.5c4.3 0 7.6 3 7.6 7.1 0 3.9-3.3 6.9-7.6 6.9s-7.6-3-7.6-6.9c0-4.1 3.3-7.1 7.6-7.1z" },
  "fruit.mandarin": { fill: "#e08a2a", body: "M16 12.5c5 0 8.8 3 8.8 7 0 3.9-3.8 7-8.8 7s-8.8-3.1-8.8-7c0-4 3.8-7 8.8-7z" },
};
const defaultFruit = { fill: "#c0392b", body: "M16 10.5c5.1 0 9 3.7 9 8.7 0 4.7-3.9 8.4-9 8.4s-9-3.7-9-8.4c0-5 3.9-8.7 9-8.7z" };
const toolIconPaths: Record<string, string> = {
  "tool.hand-axe": "/assets/items/stone-axe.svg?v=4",
  "tool.pickaxe": "/assets/items/stone-pickaxe.svg?v=3",
  "tool.stone-spear": "/assets/items/stone-spear.svg",
  "tool.fishing-rod": "/assets/items/fishing-rod.svg",
};

/** No item art exists yet, so each stack is drawn from its id: category shape, species outline. */
function ItemIcon({ itemId }: { itemId: string }) {
  const [category] = itemId.split(".");
  if (category === "fruit") {
    const shape = fruitShapes[itemId] ?? defaultFruit;
    return (
      <svg className="item-icon" viewBox="0 0 32 32" aria-hidden="true">
        <path d={shape.body} fill={shape.fill} />
        <path d="M16 11V5" stroke="#6b4f2a" strokeWidth="1.7" strokeLinecap="round" fill="none" />
        <path d="M16 7.6c2.6-2.7 5.5-2.7 6.5-1.7-1 2.7-3.9 3.7-6.5 1.7z" fill="#5d7a3a" />
      </svg>
    );
  }
  if (category === "meat") {
    return (
      <svg className="item-icon" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M9 20c-4-4-2-11 4-13s12 1 13 7-4 10-9 9c0 3-2 5-4 5s-4-2-4-4 1-3 0-4z" fill="#a94b46" />
        <path d="M22 12c2 1 3 3 2 5" stroke="#e6d9c4" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (category === "fish") {
    return (
      <svg className="item-icon" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M4 16c5-7 14-8 20-4 2 1 3 3 4 4-1 1-2 3-4 4-6 4-15 3-20-4z" fill="#5b8ba3" />
        <path d="M4 16l-2-5v10z" fill="#5b8ba3" />
        <circle cx="21" cy="14" r="1.6" fill="#0b1512" />
      </svg>
    );
  }
  if (category === "tool") {
    const iconPath = toolIconPaths[itemId];
    if (iconPath) return <img className="item-icon item-icon--tool" src={iconPath} alt="" />;
  }
  if (category === "stone") {
    return (
      <svg className="item-icon" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M7 21l4-8 8-3 6 5-2 9-10 2z" fill="#8c9296" stroke="#5b6165" strokeWidth="1.2" />
      </svg>
    );
  }
  if (category === "wood") {
    return (
      <svg className="item-icon" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="4" y="11" width="24" height="11" rx="5" fill="#8a6a41" />
        <ellipse cx="26" cy="16.5" rx="3" ry="5.5" fill="#c0a071" />
        <ellipse cx="26" cy="16.5" rx="1.2" ry="2.4" fill="#8a6a41" />
      </svg>
    );
  }
  return (
    <svg className="item-icon" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 4l11 6v12l-11 6-11-6V10z" fill="#7f8c69" />
    </svg>
  );
}

function CraftingOverlay({ character, lastCraft, onCraft, onClose }: { character: CharacterSummary; lastCraft: GameConnection["lastCraft"]; onCraft: (recipeId: string) => void; onClose: () => void }) {
  const { t, language } = useLanguage();
  const carried = new Map((character.survival.inventory ?? []).map((stack) => [stack.itemId, stack.quantity]));

  return (
    <section className="crafting-overlay" aria-modal="true" role="dialog" aria-label={t("craftingTitle")}>
      <header>
        <div>
          <p className="eyebrow">{t("craftingIntro")}</p>
          <h2>{t("craftingTitle")}</h2>
        </div>
        <button onClick={onClose} aria-label={t("closeCrafting")}>×</button>
      </header>
      <ul className="recipe-list">
        {craftingRecipes.map((recipe) => {
          const ready = recipe.inputs.every((input) => (carried.get(input.itemId) ?? 0) >= input.quantity);
          return (
            <li key={recipe.id} className="recipe">
              <ItemIcon itemId={recipe.output.itemId} />
              <div>
                <strong>{recipe.name[language]}</strong>
                <small>
                  {t("needs")}: {recipe.inputs.map((input) => `${itemDisplayName(input.itemId, language)} ${carried.get(input.itemId) ?? 0}/${input.quantity}`).join(" · ")}
                </small>
              </div>
              <button type="button" disabled={!ready} onClick={() => onCraft(recipe.id)}>{t("make")}</button>
              {lastCraft?.recipeId === recipe.id && (
                <em className={`recipe-result recipe-result--${lastCraft.success ? "made" : "botched"}`}>
                  {t(lastCraft.success ? "craftMade" : "craftBotched")}
                  {lastCraft.chance !== null && <b> {Math.round(lastCraft.chance * 100)}%</b>}
                </em>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function InventoryOverlay({ character, onEat, onEquip, onClose }: { character: CharacterSummary; onEat: (itemId: string) => void; onEquip: (itemId: string | null) => void; onClose: () => void }) {
  const { t, language } = useLanguage();
  const stacks = [...(character.survival.inventory ?? [])].sort((left, right) => right.quantity - left.quantity);
  const totalUnits = stacks.reduce((sum, stack) => sum + stack.quantity, 0);

  return (
    <section className="inventory-overlay" aria-modal="true" role="dialog" aria-label={t("inventory")}>
      <header>
        <div>
          <p className="eyebrow">{stacks.length} {t("stacks")} · {totalUnits} {t("units")}</p>
          <h2>{t("inventory")}</h2>
        </div>
        <button onClick={onClose} aria-label={t("closeInventory")}>×</button>
      </header>
      {stacks.length === 0
        ? <p className="inventory-empty">{t("inventoryEmpty")}</p>
        : (
          <ul className="inventory-grid">
            {stacks.map((stack) => {
              const name = itemDisplayName(stack.itemId, language);
              const edible = foodNames.has(stack.itemId);
              const tool = findTool(stack.itemId);
              const wieldable = Boolean(tool);
              const condition = tool ? Math.max(0, tool.durability - (character.survival.toolWear?.[stack.itemId] ?? 0)) / tool.durability : 1;
              const isEquipped = tool ? (character.survival.equipment?.[tool.slot] ?? character.survival.equipped) === stack.itemId : false;
              return (
                <li key={stack.itemId}>
                  <button
                    type="button"
                    className={`inventory-slot${isEquipped ? " inventory-slot--equipped" : ""}`}
                    title={`${name} × ${stack.quantity}`}
                    disabled={!edible && !wieldable}
                    onClick={() => {
                      if (edible) onEat(stack.itemId);
                      else if (wieldable) onEquip(isEquipped ? null : stack.itemId);
                    }}
                  >
                    <ItemIcon itemId={stack.itemId} />
                    <b className="inventory-count">×{stack.quantity}</b>
                    <span className="inventory-name">{name}</span>
                    {tool && <span className="inventory-wear"><i style={{ width: `${Math.round(condition * 100)}%` }} /></span>}
                    {edible && <em className="inventory-eat">{t("eat")}</em>}
                    {wieldable && <em className="inventory-eat inventory-eat--equip">{t(isEquipped ? "unequip" : "equip")}</em>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

/** GDD section 8: the skill window reports what a life of actions produced; nothing here can be spent. */
function SkillCodexOverlay({ character, onSetLock, onClose }: { character: CharacterSummary; onSetLock: (skillId: string, lock: SkillLock) => void; onClose: () => void }) {
  const { t, language } = useLanguage();
  const progress = character.survival.skills ?? {};
  const locks = character.survival.locks ?? {};
  const total = Object.values(progress).reduce((sum, record) => sum + record.value, 0);
  const atCap = total >= skillSystemDefinition.totalSkillCap;

  return (
    <section className="skill-codex-overlay" aria-modal="true" role="dialog" aria-label={t("skillCodex")}>
      <header>
        <div>
          <p className="eyebrow">{t("skillCodexIntro")}</p>
          <h2>{t("skillCodex")}</h2>
        </div>
        <div className="skill-total">
          <span>{t("totalSkill")}</span>
          <strong className={atCap ? "skill-total--capped" : undefined}>{total.toFixed(2)} / {skillSystemDefinition.totalSkillCap}</strong>
          <div className="meter"><i className="meter--stamina" style={{ width: `${Math.min(100, (total / skillSystemDefinition.totalSkillCap) * 100)}%` }} /></div>
          {atCap && <small>{t("capReached")}</small>}
        </div>
        <button onClick={onClose} aria-label={t("closeSkills")}>×</button>
      </header>
      <p className="skill-lock-legend">{t("lockLegend")}</p>
      <div className="skill-codex-grid">
        {skillCategories.map((category) => (
          <section className="skill-category" key={category.id}>
            <h3>{category.name[language]}</h3>
            {defaultSkillProgression.filter((skill) => skill.category === category.id).map((skill) => {
              const record = progress[skill.id] ?? { value: 0, completedActions: 0 };
              const lock = locks[skill.id] ?? "up";
              return (
                <div className="skill-entry" key={skill.id}>
                  <div className="skill-entry-head">
                    <span>{skill.name[language]}{skill.mvp && <b className="skill-mvp">{t("mvpBadge")}</b>}</span>
                    <strong>{record.value.toFixed(3)}</strong>
                  </div>
                  <div className="meter"><i className="meter--mana" style={{ width: `${(record.value / skillSystemDefinition.individualSkillCap) * 100}%` }} /></div>
                  <div className="skill-entry-foot">
                    <small>{record.completedActions} {t("attempts")}</small>
                    <div className="skill-lock-group" role="group" aria-label={skill.name[language]}>
                      {skillLocks.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={lock === option ? "is-active" : undefined}
                          title={t(lockLabels[option])}
                          aria-pressed={lock === option}
                          onClick={() => onSetLock(skill.id, option)}
                        >
                          {lockGlyphs[option]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </section>
  );
}

function WorldMapOverlay({ position, exploredTrail, onClose }: { position: PlayerPosition; exploredTrail: PlayerPosition[]; onClose: () => void }) {
  const { t, language } = useLanguage();
  const playerPoint = toMapPoint(position);
  // Only where the wanderer stands is lit. The trail is still recorded, but the atlas shows a lamp,
  // not a history: at world scale a walked path would smear across the whole frontier.
  const underground = Boolean(INTERIOR_ZONES[position.zoneId]);
  return (
    <section className="world-map-overlay" aria-modal="true" role="dialog" aria-label={t("worldMap")}>
      <header>
        <div>
          <p className="eyebrow">{WORLD_EXTENT.toLocaleString()} × {WORLD_EXTENT.toLocaleString()} · THE VERDANT FRONTIER</p>
          <h2>{t("worldMap")}</h2>
        </div>
        <button onClick={onClose} aria-label={t("close")}>×</button>
      </header>
      <div className="world-atlas">
        <div className="atlas-world-plane">
          {Object.entries(atlasLayout().bounds).map(([zoneId, bounds]) => (
            <div
              key={zoneId}
              className="atlas-zone"
              style={{ left: `${bounds.left}%`, top: `${bounds.top}%`, width: `${bounds.width}%`, height: `${bounds.height}%`, backgroundImage: `url(${zoneMapImages[zoneId]})` }}
            >
              <span className="atlas-zone-label">{getZoneDefinition(zoneId)?.name[language] ?? zoneId}</span>
            </div>
          ))}
          <svg className="atlas-fog" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <mask id="exploration-mask">
                <rect width="100" height="100" fill="white" />
                {!underground && <ellipse cx={playerPoint.x} cy={playerPoint.y} rx={atlasLayout().sightRx} ry={atlasLayout().sightRy} fill="black" />}
              </mask>
              <pattern id="fog-texture" width="6" height="6" patternUnits="userSpaceOnUse">
                <rect width="6" height="6" fill="#4a3c26" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#fog-texture)" opacity=".82" mask="url(#exploration-mask)" />
          </svg>
          <i className={`atlas-player${underground ? " atlas-player--underground" : ""}`} style={{ left: `${playerPoint.x}%`, top: `${playerPoint.y}%` }}><b /></i>
        </div>
        <span className="atlas-undiscovered">{t("undiscovered")}</span>
        <span className="atlas-scale">{WORLD_EXTENT.toLocaleString()} × {WORLD_EXTENT.toLocaleString()}</span>
      </div>
    </section>
  );
}
