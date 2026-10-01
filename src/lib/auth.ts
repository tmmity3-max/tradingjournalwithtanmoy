import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getAuthClient } from "@/integrations/firebase/client";

/** Resolves with the signed-in user (or null) once Firebase has restored the session. */
export async function currentUser(): Promise<User | null> {
  const auth = getAuthClient();
  await auth.authStateReady();
  return auth.currentUser;
}

export const signUpWithEmail = (email: string, password: string) =>
  createUserWithEmailAndPassword(getAuthClient(), email, password);

export const signInWithEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(getAuthClient(), email, password);

export const signInWithGoogle = () => signInWithPopup(getAuthClient(), new GoogleAuthProvider());

export const signOutUser = () => fbSignOut(getAuthClient());

/** Turn Firebase error codes into short, readable messages. */
export function authMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try signing in.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a bit and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "";
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in popup. Allow popups for this site and try again.";
    case "auth/unauthorized-domain":
      return "This domain isn't authorised in Firebase. Add it under Authentication -> Settings -> Authorized domains.";
    default:
      return e instanceof Error ? e.message : "Something went wrong. Please try again.";
  }
}
