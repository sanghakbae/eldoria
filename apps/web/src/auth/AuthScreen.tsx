import { LanguageToggle, useLanguage } from "../i18n/LanguageContext";

type AuthScreenProps = {
  error: string | null;
  pending: boolean;
  onGoogle: () => Promise<void>;
};

export function AuthScreen({ error, pending, onGoogle }: AuthScreenProps) {
  const { t } = useLanguage();

  return (
    <main className="auth-shell">
      <div className="auth-atmosphere" aria-hidden="true"><i /><i /><i /></div>
      <section className="auth-card">
        <LanguageToggle />
        <div className="auth-sigil">E</div>
        <p className="eyebrow">{t("frontier")}</p>
        <h1>ELDORIA</h1>
        <p className="auth-intro">{t("authIntro")}</p>

        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-google" type="button" disabled={pending} onClick={() => void onGoogle()}><b>G</b> {pending ? t("openingGate") : t("google")}</button>
        <p className="auth-only-google">{t("googleOnly")}</p>
      </section>
      <p className="auth-footnote">{t("originalWorld")}</p>
    </main>
  );
}
