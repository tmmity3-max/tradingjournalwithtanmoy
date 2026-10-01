import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/** Web-app config from the Firebase console (Project settings -> Your apps). Safe to expose in the browser. */
function config() {
  const env = import.meta.env;
  const cfg = {
    apiKey: (env["VITE_FIREBASE_API_KEY"] as string | undefined) ?? "",
    authDomain: (env["VITE_FIREBASE_AUTH_DOMAIN"] as string | undefined) ?? "",
    projectId: (env["VITE_FIREBASE_PROJECT_ID"] as string | undefined) ?? "",
    appId: (env["VITE_FIREBASE_APP_ID"] as string | undefined) ?? "",
  };
  const missing = Object.entries(cfg)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing Firebase config: ${missing.join(", ")}. Copy .env.example to .env and fill it in.`);
  }
  return cfg;
}

let app: FirebaseApp | undefined;

function getApp(): FirebaseApp {
  if (!app) app = getApps()[0] ?? initializeApp(config());
  return app;
}

export const getAuthClient = (): Auth => getAuth(getApp());
export const getDb = (): Firestore => getFirestore(getApp());
