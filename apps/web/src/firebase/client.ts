import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import { browserLocalPersistence, browserPopupRedirectResolver, browserSessionPersistence, getAuth, inMemoryPersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { readFirebaseConfig } from "./config";

export const firebaseConfig = readFirebaseConfig({
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_MEASUREMENT_ID: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
});
export const firebaseApp = initializeApp(firebaseConfig);
// getAuth stores the session in IndexedDB first, which fails with "Database is closing/hidden"
// inside Electron-based browsers. localStorage is just as durable here and never hits that path.
export const auth = createAuth();

function createAuth() {
  try {
    return initializeAuth(firebaseApp, {
      persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    // A hot reload re-runs this module against an already initialised app.
    return getAuth(firebaseApp);
  }
}
export const firestore = getFirestore(firebaseApp);

if (firebaseConfig.measurementId) {
  void isSupported().then((supported) => {
    if (supported) getAnalytics(firebaseApp);
  });
}
