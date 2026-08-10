import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canonical, pullRemote, pushRemote, readLocal, writeLocal, type Snapshot } from "@/lib/journal-sync";
import { fetchUpstoxCmp, getUpstoxStatus, saveUpstoxToken } from "@/lib/upstox.functions";


export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Trading Journal Pro — Cloud Synced Trade Log" },
      {
        name: "description",
        content:
          "Track trades, rules and P&L in Trading Journal Pro. Sign in once and your journal syncs across every device.",
      },
      { property: "og:title", content: "Trading Journal Pro — Cloud Synced Trade Log" },
      {
        property: "og:description",
        content:
          "Track trades, rules and P&L in Trading Journal Pro. Sign in once and your journal syncs across every device.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tradingjournalwithtanmoy.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://tradingjournalwithtanmoy.lovable.app/" }],

  }),
  component: JournalPage,
});

function JournalPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"synced" | "saving">("synced");
  const [email, setEmail] = useState<string | null>(null);
  const lastJson = useRef<string>("");
  const lastPushAt = useRef<number>(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanupFns: Array<() => void> = [];

    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        navigate({ to: "/auth", search: { next: undefined }, replace: true });
        return;
      }
      if (cancelled) return;
      setEmail(user.email ?? null);

      const remote = await pullRemote(user.id);
      const local = readLocal();
      if (remote && Object.keys(remote).length > 0) {
        writeLocal(remote);
        lastJson.current = canonical(remote);
      } else {
        await pushRemote(user.id, local);
        lastJson.current = canonical(local);
      }
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
            await pushRemote(user.id, latest);
            lastPushAt.current = Date.now();
          } catch (e) {
            console.error(e);
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

      const channel = supabase
        .channel("journal_state_sync")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "journal_state",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const incoming = (payload.new as { data?: Snapshot } | null)?.data;
            if (!incoming) return;
            const json = canonical(incoming);
            if (json === lastJson.current) return;
            // Ignore the echo of our own recent write.
            if (Date.now() - lastPushAt.current < 4000) {
              lastJson.current = json;
              return;
            }
            // Only act if the incoming data really differs from what is on this device.
            if (json === canonical(readLocal())) {
              lastJson.current = json;
              return;
            }
            lastJson.current = json;
            writeLocal(incoming);
            if (iframeRef.current) {
              // eslint-disable-next-line no-self-assign
              iframeRef.current.src = iframeRef.current.src;
            }
          },
        )
        .subscribe();
      cleanupFns.push(() => {
        supabase.removeChannel(channel);
      });
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
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return reply(event.source, { rid: d.rid, error: "auth" });

      try {
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
          const blob = await (await fetch(d.dataUrl)).blob();
          const path = `${user.id}/${d.tradeId ?? "trade"}-${Date.now()}.jpg`;
          const { error } = await supabase.storage
            .from("trade-charts")
            .upload(path, blob, { contentType: "image/jpeg", upsert: true });
          if (error) throw error;
          return reply(event.source, { rid: d.rid, path });
        }
        if (d.type === "tj-chart-url" && d.path) {
          const { data, error } = await supabase.storage
            .from("trade-charts")
            .createSignedUrl(d.path, 60 * 60 * 24 * 7);
          if (error || !data) throw error ?? new Error("no url");
          return reply(event.source, { rid: d.rid, url: data.signedUrl });
        }
        if (d.type === "tj-chart-delete" && d.path) {
          await supabase.storage.from("trade-charts").remove([d.path]);
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

  const signOut = async () => {
    const snap = readLocal();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      try {
        await pushRemote(data.user.id, snap);
      } catch (e) {
        console.error(e);
      }
    }
    Object.keys(snap).forEach((k) => localStorage.removeItem(k));
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: undefined }, replace: true });
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

      <div className="pointer-events-auto fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur">
        <span className="text-muted-foreground">
          {status === "saving" ? "Saving…" : "Synced"}
        </span>
        {email ? <span className="hidden text-foreground sm:inline">· {email}</span> : null}
        <button
          onClick={signOut}
          className="rounded-full bg-primary px-2.5 py-1 font-medium text-primary-foreground"
        >
          Sign out
        </button>
      </div>
    </main>

  );
}
