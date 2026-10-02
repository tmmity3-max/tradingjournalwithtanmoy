import { createFileRoute } from "@tanstack/react-router";

/**
 * Public Firebase identifiers needed by the Chrome extension to write
 * watchlists via linking codes. These values are already embedded in the
 * web client bundle — exposing them here is not a security risk.
 * Security is enforced by firestore.rules + the linking-code secret.
 */
export const Route = createFileRoute("/api/firebase-public-config")({
  server: {
    handlers: {
      GET: async () => {
        const projectId =
          process.env["VITE_FIREBASE_PROJECT_ID"] ||
          process.env["FIREBASE_PROJECT_ID"] ||
          "";
        const apiKey = process.env["VITE_FIREBASE_API_KEY"] || "";

        if (!projectId || !apiKey) {
          return new Response(
            JSON.stringify({ error: "Firebase config not set on server" }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }

        return new Response(JSON.stringify({ projectId, apiKey }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=3600",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
