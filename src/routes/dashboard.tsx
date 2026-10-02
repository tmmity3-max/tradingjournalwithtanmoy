import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { currentUser, signOutUser } from "@/lib/auth";
import {
  canonical,
  chartObjectUrl,
  deleteChart,
  journalCol,
  pullRemote,
  pushRemote,
  readLocal,
  toSnapshot,
  uploadChart,
  writeLocal,
} from "@/lib/journal-sync";
import type { Snapshot } from "@/lib/journal-sync";
import { fetchUpstoxCmp, getUpstoxStatus, saveUpstoxToken } from "@/lib/upstox.functions";


export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard — Trading Journal Pro" },
      {
        name: "description",
        content:
          "Track trades, rules and P&L in Trading Journal Pro. Sign in once and your journal syncs across every device.",
      },
      { property: "og:title", content: "Dashboard — Trading Journal Pro" },
      {
        property: "og:description",
        content:
          "Track trades, rules and P&L in Trading Journal Pro. Sign in once and your journal syncs across every device.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],

  }),
  component: JournalPage,
});

function JournalPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"synced" | "saving">("synced");
  const [email, setEmail] = useState<string | null>(null);
  const lastJson = useRef<string>("");
  const lastSnap = useRef<Snapshot | null>(null);
  const lastPushAt = useRef<number>(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanupFns: Array<() => void> = [];

    (async () => {
      const user = await currentUser();
      if (!user) {
        navigate({ to: "/auth", search: { next: "/dashboard" }, replace: true });
        return;
      }
      if (cancelled) return;
      setEmail(user.email ?? null);

      // Merge cloud + local so extension-written keys (tj_watchlists, etc.)
      // are not wiped when remote has other journal data but no watchlists yet.
      const remote = (await pullRemote(user.uid)) ?? {};
      const local = readLocal();
      const merged: Record<string, string> = { ...remote };
      for (const [k, v] of Object.entries(local)) {
        if (!(k in remote)) merged[k] = v;
      }
      // Watchlist keys: prefer non-empty local over empty/missing remote
      // (Connect & Sync writes these into localStorage right before reload).
      for (const k of ["tj_watchlists", "tj_wl_settings"]) {
        if (local[k] && local[k] !== remote[k]) merged[k] = local[k];
      }
      writeLocal(merged);
      if (canonical(merged) !== canonical(remote)) {
        try {
          await pushRemote(user.uid, merged, Object.keys(remote).length ? remote : null);
        } catch (e) {
          console.error(e);
        }
      }
      lastJson.current = canonical(merged);
      lastSnap.current = merged;
      if (cancelled) return;
      setReady(true);

      let timer: ReturnType<typeof setTimeout> | undefined;
      const schedulePush = () => {
        const snap = readLocal();
        const json = canonical(snap);
        if (json === lastJson.current) return;
        setStatus("saving");
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
          const latest = readLocal();
          const latestJson = canonical(latest);
          lastJson.current = latestJson;
          try {
            lastPushAt.current = Date.now();
            await pushRemote(user.uid, latest, lastSnap.current);
            lastSnap.current = latest;
            lastPushAt.current = Date.now();
          } catch (e) {
            console.error(e);
            lastJson.current = ""; // force a retry on the next poll
          }
          setStatus("synced");
        }, 700);
      };

      const onStorage = () => schedulePush();
      window.addEventListener("storage", onStorage);
      const poll = setInterval(schedulePush, 2000);
      cleanupFns.push(() => window.removeEventListener("storage", onStorage));
      cleanupFns.push(() => clearInterval(poll));
      cleanupFns.push(() => timer && clearTimeout(timer));

      const unsubscribe = onSnapshot(journalCol(user.uid), (qs) => {
        // Our own writes are echoed locally first; only react to real server data.
        if (qs.metadata.hasPendingWrites || qs.empty) return;
        const incoming = toSnapshot(qs);
        const json = canonical(incoming);
        if (json === lastJson.current) {
          lastSnap.current = incoming;
          return;
        }
        // Ignore the echo of our own recent write.
        if (Date.now() - lastPushAt.current < 4000) {
          lastJson.current = json;
          lastSnap.current = incoming;
          return;
        }
        // Only act if the incoming data really differs from what is on this device.
        if (json === canonical(readLocal())) {
          lastJson.current = json;
          lastSnap.current = incoming;
          return;
        }
        // If only the extension's watchlist (or its settings) changed, refresh just
        // that tab instead of reloading the whole journal (which would interrupt
        // whatever is being typed).
        const before = lastSnap.current ?? {};
        const changedKeys = new Set<string>();
        for (const k of new Set([...Object.keys(before), ...Object.keys(incoming)])) {
          if (before[k] !== incoming[k]) changedKeys.add(k);
        }
        const WATCHLIST_KEYS = new Set(["tj_watchlists", "tj_wl_settings"]);
        const onlyWatchlist = changedKeys.size > 0 && [...changedKeys].every((k) => WATCHLIST_KEYS.has(k));
        lastJson.current = json;
        lastSnap.current = incoming;
        writeLocal(incoming);
        if (onlyWatchlist && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({ __tj: 1, type: "tj-wl-refresh" }, "*");
        } else if (iframeRef.current) {
          // eslint-disable-next-line no-self-assign
          iframeRef.current.src = iframeRef.current.src;
        }
      });
      cleanupFns.push(unsubscribe);
    })();

    return () => {
      cancelled = true;
      cleanupFns.forEach((fn) => fn());
    };
  }, [navigate]);

  // Bridge: the journal iframe asks us to store / fetch its chart screenshots.
  useEffect(() => {
    const reply = (source: MessageEventSource | null, payload: Record<string, unknown>) => {
      (source as Window | null)?.postMessage({ __tj: 1, ...payload }, "*");
    };

    const onMessage = async (event: MessageEvent) => {
      const d = event.data as
        | {
            __tj?: number;
            type?: string;
            rid?: number;
            tradeId?: string;
            dataUrl?: string;
            path?: string;
            token?: string;
            symbols?: Array<{ symbol: string; exchange: string }>;
          }
        | null;
      if (!d || !d.__tj || !d.rid || !d.type) return;
      const user = await currentUser();
      if (!user) return reply(event.source, { rid: d.rid, error: "auth" });

      try {
        if (d.type === "tj-account") {
          return reply(event.source, { rid: d.rid, email: user.email ?? "" });
        }
        if (d.type === "tj-signout") {
          reply(event.source, { rid: d.rid, ok: true });
          await signOut();
          return;
        }
        if (d.type === "tj-upstox-status") {
          const res = await getUpstoxStatus();
          return reply(event.source, { rid: d.rid, ...res });
        }
        if (d.type === "tj-upstox-save") {
          const res = await saveUpstoxToken({ data: { token: d.token ?? "" } });
          return reply(event.source, { rid: d.rid, ...res });
        }
        if (d.type === "tj-upstox-cmp") {
          const res = await fetchUpstoxCmp({ data: { symbols: d.symbols ?? [] } });
          return reply(event.source, { rid: d.rid, ...res });
        }

        if (d.type === "tj-chart-upload" && d.dataUrl) {
          const chartId = encodeURIComponent(`${d.tradeId ?? "trade"}-${Date.now()}`);
          const path = await uploadChart(user.uid, chartId, d.dataUrl);
          return reply(event.source, { rid: d.rid, path });
        }
        if (d.type === "tj-chart-url" && d.path) {
          const url = await chartObjectUrl(user.uid, d.path);
          return reply(event.source, { rid: d.rid, url });
        }
        if (d.type === "tj-chart-delete" && d.path) {
          await deleteChart(user.uid, d.path);
          return reply(event.source, { rid: d.rid, ok: true });
        }
      } catch (e) {
        console.error(e);
        return reply(event.source, { rid: d.rid, error: "failed" });
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { __tj: 1, type: "tj-sync-status", status },
      "*",
    );
  }, [status]);

  const signOut = async () => {
    const snap = readLocal();
    const user = await currentUser();
    if (user) {
      try {
        await pushRemote(user.uid, snap, lastSnap.current);
      } catch (e) {
        console.error(e);
      }
    }
    Object.keys(snap).forEach((k) => localStorage.removeItem(k));
    await signOutUser();
    navigate({ to: "/", replace: true });
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Syncing your journal…</p>
      </div>
    );
  }

  return (
    <main className="relative h-screen w-screen">
      <h1 className="sr-only">Trading Journal Pro — cloud-synced trade log</h1>
      <iframe
        ref={iframeRef}
        title="Trading Journal Pro"
        src="/app.html"
        className="h-full w-full border-0"
      />

      <span className="sr-only">
        {status === "saving" ? "Saving" : "Synced"} {email ?? ""}
      </span>
    </main>

  );
}
