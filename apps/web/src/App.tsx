import { GameCanvas } from "./game/GameCanvas";
import { useGameConnection } from "./network/useGameConnection";
import { AuthScreen } from "./auth/AuthScreen";
import { useAuth } from "./auth/useAuth";
import { LanguageToggle, useLanguage, type TranslationKey } from "./i18n/LanguageContext";

const quickSlots: TranslationKey[] = ["blade", "bandage", "torch", "map"];

export function App() {
  const { language } = useLanguage();
  const session = useAuth(language);

  if (session.loading) return <main className="auth-shell"><div className="auth-sigil auth-sigil--loading">E</div></main>;
  if (!session.user) {
    return <AuthScreen error={session.error} pending={session.pending} onSignIn={session.signIn} onRegister={session.register} onGoogle={session.signInWithGoogle} />;
  }

  return <WorldScreen playerName={session.user.displayName ?? session.user.email?.split("@")[0] ?? "Wanderer"} onSignOut={session.signOut} />;
}

function WorldScreen({ playerName, onSignOut }: { playerName: string; onSignOut: () => Promise<void> }) {
  const connection = useGameConnection();
  const { t } = useLanguage();

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
            <p className="location">{t("location")}</p>
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
              <strong>{t("mossward")}</strong>
              <small>{t("safeSettlement")}</small>
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
          {quickSlots.map((slot, index) => <button key={slot}><kbd>{index + 1}</kbd><span>{t(slot).slice(0, 1)}</span><small>{t(slot)}</small></button>)}
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
