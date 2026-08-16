import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import type { SkillProgressionConfig } from "@eldoria/game-data";
import { resolveGameServerUrl } from "../network/connection";
import { LanguageToggle, useLanguage } from "../i18n/LanguageContext";

export function AdminSkillSettings({ user, onExit }: { user: User; onExit: () => void }) {
  const { language } = useLanguage();
  const [skills, setSkills] = useState<SkillProgressionConfig[]>([]);
  const [message, setMessage] = useState(language === "ko" ? "설정을 불러오는 중…" : "Loading settings…");
  const apiUrl = `${resolveGameServerUrl(window.location, import.meta.env.VITE_GAME_SERVER_URL).replace(/^ws/, "http")}/admin/skill-config`;

  useEffect(() => {
    void request(user, apiUrl).then((result) => {
      setSkills(result.skills);
      setMessage("");
    }).catch(() => setMessage(language === "ko" ? "관리자 설정을 불러오지 못했습니다." : "Could not load admin settings."));
  }, [apiUrl, language, user]);

  const updateLocal = (skillId: string, field: "actionsPerGain" | "gainAmount", value: number) => {
    setSkills((current) => current.map((skill) => skill.id === skillId ? { ...skill, [field]: value } : skill));
  };
  const save = async (skill: SkillProgressionConfig) => {
    setMessage(language === "ko" ? `${skill.name.ko} 저장 중…` : `Saving ${skill.name.en}…`);
    try {
      const result = await request(user, apiUrl, { skillId: skill.id, actionsPerGain: skill.actionsPerGain, gainAmount: skill.gainAmount });
      setSkills((current) => current.map((item) => item.id === skill.id ? result.skill : item));
      setMessage(language === "ko" ? "저장되었습니다. 서버 계산에 즉시 적용됩니다." : "Saved. Server calculations use the new value immediately.");
    } catch {
      setMessage(language === "ko" ? "저장하지 못했습니다." : "Save failed.");
    }
  };

  return <main className="admin-shell"><section className="admin-card">
    <header><div><p className="eyebrow">ELDORIA ADMIN</p><h1>{language === "ko" ? "스킬 성장 설정" : "SKILL PROGRESSION"}</h1></div><div><LanguageToggle /><button className="admin-exit" onClick={onExit}>{language === "ko" ? "게임으로" : "Back to game"}</button></div></header>
    <p className="admin-help">{language === "ko" ? "행동 횟수가 누적될 때마다 설정한 성장 수치가 서버에서 적용됩니다. 예: 활 10회 / 0.001." : "The server grants the configured gain after the action count accumulates. Example: Bow 10 actions / 0.001."}</p>
    <div className="admin-skill-list">{skills.map((skill) => <div className="admin-skill" key={skill.id}>
      <div><strong>{skill.name[language]}</strong><small>{skill.id}</small></div>
      <label>{language === "ko" ? "필요 행동 횟수" : "Actions per gain"}<input type="number" min="1" max="10000" step="1" value={skill.actionsPerGain} onChange={(event) => updateLocal(skill.id, "actionsPerGain", Number(event.target.value))} /></label>
      <label>{language === "ko" ? "성장 수치" : "Gain amount"}<input type="number" min="0.000001" max="1" step="0.001" value={skill.gainAmount} onChange={(event) => updateLocal(skill.id, "gainAmount", Number(event.target.value))} /></label>
      <button onClick={() => void save(skill)}>{language === "ko" ? "저장" : "Save"}</button>
    </div>)}</div>
    <p className="admin-message">{message}</p>
  </section></main>;
}

async function request(user: User, url: string, update?: { skillId: string; actionsPerGain: number; gainAmount: number }) {
  const token = await user.getIdToken();
  const response = await fetch(url, { method: update ? "PUT" : "GET", headers: { authorization: `Bearer ${token}`, ...(update ? { "content-type": "application/json" } : {}) }, body: update ? JSON.stringify(update) : undefined });
  if (!response.ok) throw new Error(`Admin API returned ${response.status}`);
  return await response.json() as { skills: SkillProgressionConfig[]; skill: SkillProgressionConfig };
}
