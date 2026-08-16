export type FirebaseEnvironment = {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_MEASUREMENT_ID?: string;
};

export type EldoriaFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

export function readFirebaseConfig(environment: FirebaseEnvironment): EldoriaFirebaseConfig {
  const required = {
    apiKey: environment.VITE_FIREBASE_API_KEY,
    authDomain: environment.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: environment.VITE_FIREBASE_PROJECT_ID,
    storageBucket: environment.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: environment.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: environment.VITE_FIREBASE_APP_ID,
  };

  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) throw new Error(`Missing Firebase configuration: ${missing.join(", ")}`);

  return {
    apiKey: required.apiKey as string,
    authDomain: required.authDomain as string,
    projectId: required.projectId as string,
    storageBucket: required.storageBucket as string,
    messagingSenderId: required.messagingSenderId as string,
    appId: required.appId as string,
    ...(environment.VITE_FIREBASE_MEASUREMENT_ID ? { measurementId: environment.VITE_FIREBASE_MEASUREMENT_ID } : {}),
  };
}
