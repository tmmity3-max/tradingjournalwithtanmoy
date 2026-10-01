import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

function projectId(): string {
  const id = process.env["FIREBASE_PROJECT_ID"] || process.env["VITE_FIREBASE_PROJECT_ID"];
  if (!id) throw new Error("Missing FIREBASE_PROJECT_ID");
  return id;
}

type FsValue = { stringValue?: string; timestampValue?: string };
type FsDoc = { fields?: Record<string, FsValue>; updateTime?: string };

/**
 * Minimal Firestore REST client that acts AS THE USER (their ID token), so the
 * security rules in firestore.rules apply. No service-account key needed, and it
 * runs on any edge/Node host.
 */
function makeDb(pid: string, idToken: string) {
  const base = `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents`;
  const headers = { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };
  return {
    async getDoc(path: string): Promise<FsDoc | null> {
      const res = await fetch(`${base}/${path}`, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Firestore read failed (${res.status})`);
      return (await res.json()) as FsDoc;
    },
    async setDoc(path: string, fields: Record<string, FsValue>): Promise<void> {
      const res = await fetch(`${base}/${path}`, { method: "PATCH", headers, body: JSON.stringify({ fields }) });
      if (!res.ok) throw new Error(`Firestore write failed (${res.status})`);
    },
  };
}

export const requireFirebaseAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader) throw new Error("Unauthorized: No authorization header provided");
  if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized: Only Bearer tokens are supported");
  const token = authHeader.slice("Bearer ".length);
  if (token.split(".").length !== 3) throw new Error("Unauthorized: Invalid token");

  const pid = projectId();
  let payload;
  try {
    ({ payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${pid}`, audience: pid }));
  } catch {
    throw new Error("Unauthorized: Invalid token");
  }
  if (!payload.sub) throw new Error("Unauthorized: No user ID found in token");

  return next({ context: { userId: payload.sub, db: makeDb(pid, token) } });
});
