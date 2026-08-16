import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_FIREBASE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

export type VerifyIdToken = (idToken: string) => Promise<{ uid: string; admin: boolean }>;

export function createFirebaseTokenVerifier(projectId: string): VerifyIdToken {
  return async (idToken) => {
    const { payload } = await jwtVerify(idToken, GOOGLE_FIREBASE_KEYS, {
      algorithms: ["RS256"],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    });
    if (!payload.sub) throw new Error("Firebase token has no subject");
    return { uid: payload.sub, admin: payload.admin === true };
  };
}
