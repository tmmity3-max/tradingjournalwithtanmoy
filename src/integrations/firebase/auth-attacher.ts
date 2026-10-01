import { createMiddleware } from "@tanstack/react-start";
import { currentUser } from "@/lib/auth";

// Registered as a global functionMiddleware in src/start.ts so every server
// function call from the browser carries the signed-in user's Firebase ID token.
export const attachFirebaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const user = await currentUser();
  const token = user ? await user.getIdToken() : undefined;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
