import { describe, expect, it } from "vitest";
import { readFirebaseConfig } from "./config";

const environment = {
  VITE_FIREBASE_API_KEY: "public-key",
  VITE_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "example",
  VITE_FIREBASE_STORAGE_BUCKET: "example.firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123",
  VITE_FIREBASE_APP_ID: "app-id",
};

describe("readFirebaseConfig", () => {
  it("maps Vite variables to Firebase configuration", () => {
    expect(readFirebaseConfig(environment)).toMatchObject({ projectId: "example", apiKey: "public-key" });
  });

  it("fails fast when required values are absent", () => {
    expect(() => readFirebaseConfig({ ...environment, VITE_FIREBASE_APP_ID: "" })).toThrow("appId");
  });
});
