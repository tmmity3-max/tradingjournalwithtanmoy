import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { currentUser } from "@/lib/auth";
import { LoginModal } from "@/components/LoginModal";

const EXTENSION_ZIP = "/extension/tm-watchlist-extension.zip";

const WITHOUT = [
  "Copy 15+ symbols by hand between platforms",
  "Rebuild your Zerodha & TradingView lists every day",
  "Lose track of what you screened on",
  "Waste ~15 minutes every trading session",
];
const WITH = [
  "Add once, see it on Screener, TradingView & Kite",
  "One-click chart jumps from any platform",
  "Colour flags & notes to track your conviction",
  "Your watchlist report sits right next to your trade journal",
];
const FEATURES = [
  { icon: "🔎", title: "Screener Bulk Scanner", text: "Scan every result page of a Screener.in query and import all the symbols in one click." },
  { icon: "📂", title: "Zerodha Holdings Scan", text: "Pull your Kite holdings into the sidebar watchlist and open them on TradingView or Screener." },
  { icon: "⭐", title: "Super Watchlist", text: "Every red or green marked stock from all your lists, combined live into one master list." },
  { icon: "⚡", title: "Live Badges", text: "Previous-day-high crossover arrows and relative-volume badges on each row, powered by Upstox." },
  { icon: "🗂️", title: "Sections & Colour Flags", text: "Drag-and-drop sections, colour filters, notes and instant search to keep big lists tidy." },
  { icon: "⌨️", title: "Ctrl + Shift + A", text: "Add the stock on your current chart to your watchlist without leaving TradingView." },
];


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
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    currentUser().then((user) => {
      if (user) {
        setSignedIn(true);
        navigate({ to: "/dashboard", replace: true });
      }
    });
  }, [navigate]);

  return (
    <main className="min-h-screen bg-gradient-to-r from-[#1b3fa0] via-[#2f6fd0] to-[#7cc0f5] text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-8 py-10">
        <div className="flex items-center justify-between">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-700 text-sm font-bold shadow-lg">
            ↗
          </span>
          <button
            onClick={() => (signedIn ? navigate({ to: "/dashboard" }) : setOpen(true))}
            className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold shadow-lg transition-colors hover:bg-blue-600"
          >
            {signedIn ? "Open dashboard" : "Log in"}
          </button>
        </div>

        <section className="grid flex-1 items-center gap-10 py-10 md:grid-cols-2">
          <div>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
              Trading Journal Pro
              <span className="ml-2 align-middle text-base font-semibold text-blue-100 md:text-lg">
                – NSE, BSE &amp; MCX –
              </span>
            </h1>
            <p className="mt-6 max-w-md text-lg font-bold">
              Log, analyse and improve your trades on Indian markets.
            </p>
            <p className="mt-3 max-w-md text-sm text-blue-100">
              Position sizer, dashboards, Zerodha-style charges.
            </p>
          </div>

          <div className="relative h-[300px]">
            <div className="absolute left-10 top-2 flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold shadow-xl">
              📈 Equity Curve
            </div>
            <div className="absolute left-0 top-24 flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-xl">
              ₹ Realised P&amp;L
            </div>
            <div className="absolute left-24 top-40 flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-xl">
              🥧 Win / Loss
            </div>
            <div className="absolute left-6 top-60 flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold shadow-xl">
              ☰ Capital Ledger
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold shadow-lg">
              🧩 Free Chrome Extension · TM Watchlist
            </span>
            <h2 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              One Watchlist. Every Platform.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg font-bold">
              Zerodha. TradingView. Screener.in. Add once, see everywhere.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-sm text-blue-100">
              Stop copying symbols between tabs. The extension adds a watchlist sidebar to all three
              sites, and your Trading Journal keeps it in the same place as your trades.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a
                href={EXTENSION_ZIP}
                download
                className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-800 shadow-xl transition-colors hover:bg-blue-50"
              >
                Download Extension (.zip)
              </a>
              <button
                onClick={() => (signedIn ? navigate({ to: "/dashboard" }) : setOpen(true))}
                className="rounded-xl bg-blue-700 px-6 py-3 text-sm font-semibold shadow-lg transition-colors hover:bg-blue-600"
              >
                {signedIn ? "Open dashboard" : "Log in to your journal"}
              </button>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm font-semibold">
              <span className="rounded-xl bg-white px-4 py-2 text-slate-800 shadow-xl">Screener.in</span>
              <span aria-hidden>→</span>
              <span className="rounded-xl bg-white px-4 py-2 text-slate-800 shadow-xl">TradingView</span>
              <span aria-hidden>→</span>
              <span className="rounded-xl bg-slate-900 px-4 py-2 shadow-xl">Zerodha Kite</span>
            </div>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl bg-white p-6 text-slate-800 shadow-xl">
              <h3 className="text-lg font-bold">Without the extension</h3>
              <ul className="mt-4 space-y-3 text-sm">
                {WITHOUT.map((t) => (
                  <li key={t} className="flex gap-3">
                    <span className="font-bold text-red-600">✕</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-blue-700 p-6 shadow-xl">
              <h3 className="text-lg font-bold">With the extension</h3>
              <ul className="mt-4 space-y-3 text-sm">
                {WITH.map((t) => (
                  <li key={t} className="flex gap-3">
                    <span className="font-bold text-emerald-300">✓</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-16 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-100">Capabilities</p>
            <h2 className="mt-2 text-2xl font-extrabold md:text-3xl">Powerful. Zero complexity.</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-blue-100">
              Minimal, high-speed tools built for retail traders on Indian markets.
            </p>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`rounded-xl p-6 shadow-xl ${
                  i % 3 === 1 ? "bg-slate-900 text-white" : "bg-white text-slate-800"
                }`}
              >
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-3 text-base font-bold">{f.title}</h3>
                <p className={`mt-2 text-sm ${i % 3 === 1 ? "text-slate-300" : "text-slate-600"}`}>{f.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-16 rounded-xl bg-blue-700 p-8 shadow-xl md:flex md:items-center md:justify-between md:gap-8">
            <div>
              <h2 className="text-2xl font-extrabold">All in one place</h2>
              <p className="mt-2 max-w-xl text-sm text-blue-100">
                Log trades, track capital and keep your extension watchlists together. Connect the extension to your account and your
                watchlists appear on the Watchlist page, one tap away from your journal, on every device.</p>
            </div>
            <button
              onClick={() => (signedIn ? navigate({ to: "/dashboard" }) : setOpen(true))}
              className="mt-5 shrink-0 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-800 shadow-xl transition-colors hover:bg-blue-50 md:mt-0"
            >
              {signedIn ? "Open dashboard" : "Get started"}
            </button>
          </div>
        </section>
      </div>

      {open ? <LoginModal onClose={() => setOpen(false)} /> : null}
    </main>
  );
}

