import { useState, type FormEvent } from "react";
import { LanguageToggle, useLanguage } from "../i18n/LanguageContext";

type AuthScreenProps = {
  error: string | null;
  pending: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
  onGoogle: () => Promise<void>;
};

export function AuthScreen({ error, pending, onSignIn, onRegister, onGoogle }: AuthScreenProps) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void (mode === "signin" ? onSignIn(email, password) : onRegister(email, password));
  };

  return (
    <main className="auth-shell">
      <div className="auth-atmosphere" aria-hidden="true"><i /><i /><i /></div>
      <section className="auth-card">
        <LanguageToggle />
        <div className="auth-sigil">E</div>
        <p className="eyebrow">{t("frontier")}</p>
        <h1>ELDORIA</h1>
        <p className="auth-intro">{t("authIntro")}</p>

        <form onSubmit={submit} className="auth-form">
          <label>{t("email")}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>{t("password")}<input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-primary" type="submit" disabled={pending}>{pending ? t("openingGate") : mode === "signin" ? t("enterRealm") : t("createAccount")}</button>
        </form>

        <div className="auth-divider"><span>{t("or")}</span></div>
        <button className="auth-google" type="button" disabled={pending} onClick={() => void onGoogle()}><b>G</b> {t("google")}</button>
        <button className="auth-mode" type="button" onClick={() => setMode((current) => current === "signin" ? "register" : "signin")}>
          {mode === "signin" ? t("newAccount") : t("existingAccount")}
        </button>
      </section>
      <p className="auth-footnote">{t("originalWorld")}</p>
    </main>
  );
}
