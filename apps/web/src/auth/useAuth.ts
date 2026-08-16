import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "../firebase/client";
import type { Language } from "../i18n/LanguageContext";

type AuthState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  pending: boolean;
  admin: boolean;
};

export function useAuth(language: Language) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null, pending: false, admin: false });

  useEffect(() => {
    void getRedirectResult(auth).catch((error) => setState((current) => ({ ...current, error: formatAuthError(error, language) })));
  }, [language]);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    if (!user) {
      setState((current) => ({ ...current, user: null, loading: false, admin: false }));
      return;
    }
    void user.getIdTokenResult().then((token) => setState((current) => ({ ...current, user, loading: false, admin: token.claims.admin === true }))).catch(() => setState((current) => ({ ...current, user, loading: false, admin: false })));
  }), []);

  const perform = async (operation: () => Promise<unknown>) => {
    setState((current) => ({ ...current, pending: true, error: null }));
    try {
      await operation();
    } catch (error) {
      setState((current) => ({ ...current, error: formatAuthError(error, language) }));
    } finally {
      setState((current) => ({ ...current, pending: false }));
    }
  };

  return {
    ...state,
    signInWithGoogle: () => perform(() => signInWithGoogleProvider()),
    signOut: () => perform(() => firebaseSignOut(auth)),
  };
}

// Embedded browsers, strict popup blockers, and COOP-isolated contexts reject the popup flow.
// Those cases fall back to the redirect flow, which getRedirectResult picks up after the round trip.
const POPUP_UNAVAILABLE = new Set([
  "auth/popup-blocked",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);

async function signInWithGoogleProvider(): Promise<void> {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (!POPUP_UNAVAILABLE.has(code)) {
      throw error;
    }
    await signInWithRedirect(auth, provider);
  }
}

function formatAuthError(error: unknown, language: Language): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const messages: Record<string, [string, string]> = {
    "auth/popup-closed-by-user": ["Google sign-in was cancelled.", "Google 로그인이 취소되었습니다."],
    "auth/user-disabled": ["That account has been disabled.", "비활성화된 계정입니다."],
    "auth/too-many-requests": ["Too many attempts. Wait a moment and try again.", "시도가 너무 잦습니다. 잠시 후 다시 시도해주세요."],
    "auth/network-request-failed": ["The network request failed. Check your connection.", "네트워크 요청이 실패했습니다. 연결 상태를 확인해주세요."],
    "auth/operation-not-allowed": ["Enable Google sign-in in Firebase Console.", "Firebase Console에서 Google 로그인을 활성화해야 합니다."],
    "auth/unauthorized-domain": ["Add this domain to the Firebase authorised domains list.", "Firebase 승인된 도메인 목록에 이 도메인을 추가해야 합니다."],
  };
  const known = messages[code]?.[language === "ko" ? 1 : 0];
  if (known) return known;
  // An unmapped failure would otherwise reach the player as an unactionable "try again later",
  // so the raw detail is shown instead of being swallowed.
  console.warn("[auth] unmapped error", error);
  const detail = describeAuthError(error) || (code || "unknown");
  return language === "ko" ? `로그인 실패: ${detail}` : `Sign-in failed: ${detail}`;
}

function describeAuthError(error: unknown): string {
  if (typeof error === "string") return error;
  if (!(typeof error === "object" && error)) return String(error);
  const name = "name" in error ? String(error.name) : "";
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return [code || name, message].filter(Boolean).join(" · ");
}
