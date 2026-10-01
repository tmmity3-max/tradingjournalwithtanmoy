import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s['next'] === "string" && s['next'].startsWith("/") ? s['next'] : undefined,
  }),

  head: () => ({
    meta: [
      { title: "Sign in — Trading Journal Pro" },
      {
        name: "description",
        content: "Sign in to Trading Journal Pro to access your trade log on any device.",
      },
      { property: "og:title", content: "Sign in — Trading Journal Pro" },
      {
        property: "og:description",
        content: "Sign in to Trading Journal Pro to access your trade log on any device.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tradingjournalwithtanmoy.lovable.app/auth" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://tradingjournalwithtanmoy.lovable.app/auth" }],
  }),

  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const goNext = () => {
    if (next) window.location.replace(next);
    else navigate({ to: "/dashboard", replace: true });
  };


  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goNext();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const returnTo = next ? window.location.origin + next : window.location.origin;
    if (mode === "signup") {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: returnTo },
      });
      if (err) setError(err.message);
      else if (!data.session) setMessage("Check your email to confirm your account, then sign in.");
      else goNext();
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
      else goNext();
    }
    setBusy(false);
  };

  const google = async () => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: next ? window.location.origin + next : window.location.origin + "/dashboard" },
    });
    if (err) setError(err.message);
  };


  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b1220] px-4 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur">
        <div className="mb-5 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-sm font-bold">
            ↗
          </span>
          <span className="font-semibold tracking-tight">Trading Journal Pro</span>
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>

        <p className="mt-1 text-sm text-slate-400">
          Sign in to sync your journal across devices.
        </p>

        <button
          onClick={google}
          className="mt-6 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/10"
        >
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
          <span className="h-px flex-1 bg-white/10" />
          or
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-white/15 bg-[#0e1729] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-600/40"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-white/15 bg-[#0e1729] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-600/40"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-slate-400">{message}</p> : null}

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-sm text-slate-400 transition-colors hover:text-white"
        >
          {mode === "signin" ? "No account? Sign up" : "Already have an account? Sign in"}
        </button>

        <a
          href="/"
          className="mt-3 block text-center text-xs text-slate-500 transition-colors hover:text-slate-300"
        >
          ← Back to home
        </a>
      </div>
    </main>
  );
}

