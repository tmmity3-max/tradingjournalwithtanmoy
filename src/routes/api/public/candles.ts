import { createFileRoute } from "@tanstack/react-router";

const SUFFIX: Record<string, string> = {
  NSE: ".NS",
  BSE: ".BO",
  NFO: ".NS",
  MCX: "",
  CRYPTO: "-USD",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=1800",
      "access-control-allow-origin": "*",
    },
  });
}

export const Route = createFileRoute("/api/public/candles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const raw = (url.searchParams.get("symbol") || "").trim().toUpperCase();
        const exchange = (url.searchParams.get("exchange") || "NSE").toUpperCase();
        const range = url.searchParams.get("range") || "5y";
        if (!raw || !/^[A-Z0-9&._-]{1,25}$/.test(raw)) {
          return json({ error: "Invalid symbol" }, 400);
        }

        const suffix = raw.includes(".") ? "" : (SUFFIX[exchange] ?? ".NS");
        const candidates = [`${raw}${suffix}`, raw];

        for (const ticker of candidates) {
          try {
            const res = await fetch(
              `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
                ticker,
              )}?interval=1d&range=${encodeURIComponent(range)}`,
              { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } },
            );
            if (!res.ok) continue;
            const data: any = await res.json();
            const result = data?.chart?.result?.[0];
            const ts: number[] = result?.timestamp ?? [];
            const q = result?.indicators?.quote?.[0];
            if (!ts.length || !q) continue;

            const candles = [];
            for (let i = 0; i < ts.length; i++) {
              const o = q.open?.[i],
                h = q.high?.[i],
                l = q.low?.[i],
                c = q.close?.[i];
              if (o == null || h == null || l == null || c == null) continue;
              candles.push({ t: ts[i]! * 1000, o, h, l, c, v: q.volume?.[i] ?? 0 });
            }
            if (!candles.length) continue;
            return json({ symbol: ticker, candles });
          } catch {
            /* try next candidate */
          }
        }
        return json({ error: "No price data found", candles: [] }, 404);
      },
    },
  },
});
