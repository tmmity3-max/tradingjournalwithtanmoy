import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const PARENT_FRAME = document.location.ancestorOrigins[0] || "null";
const ALLOWED_PARENT = PARENT_FRAME === "null" ? null : PARENT_FRAME;

let authPromise;

function post(result) {
  if (!ALLOWED_PARENT) return;
  globalThis.parent.postMessage(JSON.stringify(result), ALLOWED_PARENT);
}

async function getFirebaseAuth() {
  if (!authPromise) {
    authPromise = fetch("/api/firebase-public-config", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Firebase public configuration is unavailable.");
        const cfg = await res.json();
        if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) {
          throw new Error("Firebase configuration is incomplete.");
        }
        const app = initializeApp(cfg);
        const auth = getAuth(app);
        await setPersistence(auth, browserLocalPersistence);
        return auth;
      });
  }
  return authPromise;
}

async function signIn() {
  const auth = await getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const user = result.user;
  const idToken = await user.getIdToken();
  post({
    ok: true,
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    photoURL: user.photoURL || "",
    idToken,
  });
}

async function getToken() {
  const auth = await getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) {
    post({ ok: false, code: "AUTH_REQUIRED", error: "Please sign in with Google first." });
    return;
  }
  const idToken = await user.getIdToken();
  post({
    ok: true,
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    photoURL: user.photoURL || "",
    idToken,
  });
}

async function signOutUser() {
  const auth = await getFirebaseAuth();
  await signOut(auth);
  post({ ok: true, signedOut: true });
}

window.addEventListener("message", async (event) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data || {};
  try {
    if (data.initAuth) await signIn();
    else if (data.getToken) await getToken();
    else if (data.signOut) await signOutUser();
  } catch (e) {
    post({
      ok: false,
      code: e?.code || "AUTH_ERROR",
      error: e?.message || String(e),
    });
  }
});
