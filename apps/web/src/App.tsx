import { GameCanvas } from "./game/GameCanvas";
import { useGameConnection } from "./network/useGameConnection";

const quickSlots = ["Blade", "Bandage", "Torch", "Map"];

export function App() {
  const connection = useGameConnection();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-rune" aria-hidden="true">E</span>
          <div>
            <p className="eyebrow">THE VERDANT FRONTIER</p>
            <h1>ELDORIA</h1>
          </div>
        </div>
        <div className={`server-pill server-pill--${connection.status}`}>
          <span className="server-dot" />
          <span>{connection.label}</span>
          {connection.latency !== null && <strong>{connection.latency}ms</strong>}
        </div>
      </header>

      <section className="game-layout">
        <aside className="character-panel panel">
          <div className="portrait"><span>W</span></div>
          <div>
            <p className="eyebrow">WANDERER</p>
            <h2>Aryn Vale</h2>
            <p className="location">Mossward · Dawn</p>
          </div>
          <div className="vitals" aria-label="Character vitals">
            <Vital label="Health" value={84} tone="health" />
            <Vital label="Mana" value={61} tone="mana" />
            <Vital label="Stamina" value={93} tone="stamina" />
          </div>
          <div className="divider" />
          <p className="panel-label">ACTIVE SKILLS</p>
          <Skill name="Swordsmanship" value="32.4" />
          <Skill name="Healing" value="18.7" />
          <Skill name="Lumberjacking" value="11.2" />
        </aside>

        <section className="world-frame" aria-label="Eldoria game world">
          <GameCanvas />
          <div className="world-caption">
            <span className="compass">✦</span>
            <div>
              <strong>Mossward Crossing</strong>
              <small>Safe settlement</small>
            </div>
          </div>
          <div className="world-hint">The eastern road leads into Greythorn Wood</div>
        </section>

        <aside className="journal-panel panel">
          <p className="eyebrow">FIELD JOURNAL</p>
          <h2>A quiet beginning</h2>
          <p className="journal-copy">Meet the roadwarden beneath the old lantern tree.</p>
          <div className="objective"><span>01</span><p>Explore Mossward Crossing<strong>0 / 1</strong></p></div>
          <div className="objective"><span>02</span><p>Find the forest road<strong>0 / 1</strong></p></div>
          <div className="divider" />
          <p className="panel-label">WORLD NOTES</p>
          <p className="note">Wolves have been seen beyond the east gate after dusk.</p>
        </aside>
      </section>

      <footer className="command-deck">
        <div className="chat-preview">
          <span>System</span>
          <p>{connection.message}</p>
        </div>
        <nav className="quickbar" aria-label="Quick actions">
          {quickSlots.map((slot, index) => <button key={slot}><kbd>{index + 1}</kbd><span>{slot.slice(0, 1)}</span><small>{slot}</small></button>)}
        </nav>
        <div className="build-mark"><span>PRE-ALPHA</span><small>FOUNDATION BUILD</small></div>
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
