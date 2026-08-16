import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
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
};

export function useAuth(language: Language) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null, pending: false });

  useEffect(() => onAuthStateChanged(auth, (user) => setState((current) => ({ ...current, user, loading: false }))), []);

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
    signIn: (email: string, password: string) => perform(() => signInWithEmailAndPassword(auth, email, password)),
    register: (email: string, password: string) => perform(() => createUserWithEmailAndPassword(auth, email, password)),
    signInWithGoogle: () => perform(() => signInWithPopup(auth, new GoogleAuthProvider())),
    signOut: () => perform(() => firebaseSignOut(auth)),
  };
}

function formatAuthError(error: unknown, language: Language): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const messages: Record<string, [string, string]> = {
    "auth/invalid-credential": ["The email or password is incorrect.", "이메일 또는 비밀번호가 올바르지 않습니다."],
    "auth/email-already-in-use": ["That email is already in use.", "이미 사용 중인 이메일입니다."],
    "auth/weak-password": ["Password must be at least 6 characters.", "비밀번호는 6자 이상이어야 합니다."],
    "auth/popup-closed-by-user": ["Google sign-in was cancelled.", "Google 로그인이 취소되었습니다."],
    "auth/operation-not-allowed": ["Enable this sign-in method in Firebase Console.", "Firebase Console에서 이 로그인 방식을 활성화해야 합니다."],
  };
  return messages[code]?.[language === "ko" ? 1 : 0] ?? (language === "ko" ? "로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요." : "Sign-in failed. Please try again shortly.");
}
