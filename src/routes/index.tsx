import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LoginModal } from "@/components/LoginModal";


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
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
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
      </div>

      {open ? <LoginModal onClose={() => setOpen(false)} /> : null}
    </main>
  );
}

