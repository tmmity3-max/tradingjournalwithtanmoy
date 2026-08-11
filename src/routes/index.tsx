import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Trading Journal Pro — Log & Analyse Indian Market Trades" },
      {
        name: "description",
        content:
          "Log, analyse and improve your NSE, BSE and MCX trades. Position sizer, dashboards, Zerodha-style charges and cloud sync across devices.",
      },
      { property: "og:title", content: "Trading Journal Pro — Log & Analyse Indian Market Trades" },
      {
        property: "og:description",
        content:
          "Log, analyse and improve your NSE, BSE and MCX trades. Position sizer, dashboards, Zerodha-style charges and cloud sync across devices.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tradingjournalwithtanmoy.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://tradingjournalwithtanmoy.lovable.app/" }],
  }),
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSignedIn(true);
        navigate({ to: "/dashboard", replace: true });
      }
    });
  }, [navigate]);

  return (
    <main className="min-h-screen bg-[#0b1220] text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-sm font-bold">
            ↗
          </span>
          <span className="font-semibold tracking-tight">Trading Journal Pro</span>
        </div>
        <Link
          to="/auth"
          search={{ next: "/dashboard" }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold transition-colors hover:bg-blue-500"
        >
          {signedIn ? "Open dashboard" : "Log in"}
        </Link>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-24 pt-10 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
            Trading Journal Pro
            <span className="block text-lg font-semibold text-blue-300 md:text-xl">
              – NSE, BSE &amp; MCX –
            </span>
          </h1>
          <p className="mt-5 max-w-md text-lg font-semibold text-slate-100">
            Log, analyse and improve your trades on Indian markets.
          </p>
          <p className="mt-2 max-w-md text-sm text-slate-400">
            Position sizer, dashboards, Zerodha-style charges, chart screenshots and cloud sync on
            every device.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/auth"
              search={{ next: "/dashboard" }}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold transition-colors hover:bg-blue-500"
            >
              Log in to your journal
            </Link>
            <a
              href="#features"
              className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/5"
            >
              See what's inside
            </a>
          </div>
        </div>

        <div className="relative h-[320px] rounded-3xl bg-gradient-to-br from-blue-700 via-blue-500 to-sky-300 p-6 shadow-2xl">
          <div className="absolute right-6 top-8 rounded-xl bg-blue-700 px-4 py-3 text-xs font-semibold shadow-lg">
            📈 Equity Curve
          </div>
          <div className="absolute right-16 top-28 rounded-xl bg-white px-4 py-3 text-xs font-semibold text-slate-800 shadow-lg">
            ₹ Realised P&amp;L
          </div>
          <div className="absolute right-4 top-44 rounded-xl bg-white px-4 py-3 text-xs font-semibold text-slate-800 shadow-lg">
            🥧 Win / Loss
          </div>
          <div className="absolute bottom-10 right-8 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold shadow-lg">
            ☰ Capital Ledger
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-white/10 bg-[#0e1729] py-16">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 md:grid-cols-3">
          {[
            ["Position sizer", "Risk-based quantity with an open-risk budget you control."],
            ["Trade charts", "Attach entry and exit screenshots with remarks per trade."],
            ["Cloud sync", "Sign in once, your journal follows you to every device."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-slate-400">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
