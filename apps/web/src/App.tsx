import { GameCanvas } from "./game/GameCanvas";
import { useGameConnection } from "./network/useGameConnection";
import { AuthScreen } from "./auth/AuthScreen";
import { useAuth } from "./auth/useAuth";
import { LanguageToggle, useLanguage, type TranslationKey } from "./i18n/LanguageContext";
import type { User } from "firebase/auth";
import { useEffect, useState } from "react";

const quickSlots: TranslationKey[] = ["blade", "bandage", "torch", "map"];

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
  useEffect(() => {
    const handleZone = (event: Event) => setZoneId((event as CustomEvent<string>).detail);
    window.addEventListener("eldoria:zone-change", handleZone);
    return () => window.removeEventListener("eldoria:zone-change", handleZone);
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
          <div className="world-hint">{t("roadHint")}</div>
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
          {quickSlots.map((slot, index) => <button key={slot} title={t(slot)}><kbd>{index + 1}</kbd><QuickSlotIcon slot={slot} /><small>{t(slot)}</small></button>)}
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
