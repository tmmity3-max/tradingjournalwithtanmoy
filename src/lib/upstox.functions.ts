import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type InstrumentMap = Record<string, string>;

const cache: { day: string; maps: Partial<Record<"NSE" | "BSE", InstrumentMap>> } = {
  day: "",
  maps: {},
};

const today = () => new Date().toISOString().slice(0, 10);

async function loadInstruments(exchange: "NSE" | "BSE"): Promise<InstrumentMap> {
  if (cache.day !== today()) {
    cache.day = today();
    cache.maps = {};
  }
  const cached = cache.maps[exchange];
  if (cached) return cached;

  const res = await fetch(
    `https://assets.upstox.com/market-quote/instruments/exchange/${exchange}.json.gz`,
  );
  if (!res.ok || !res.body) throw new Error("instrument list unavailable");

  const stream = res.headers.get("content-encoding")
    ? res.body
    : res.body.pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  const rows = JSON.parse(text) as Array<{
    segment?: string;
    instrument_type?: string;
    trading_symbol?: string;
    instrument_key?: string;
    name?: string;
  }>;

  const map: InstrumentMap = {};
  for (const row of rows) {
    if (row.segment !== `${exchange}_EQ`) continue;
    if (row.instrument_type && !["EQ", "EQUITY", "A", "B"].includes(row.instrument_type)) continue;
    if (!row.trading_symbol || !row.instrument_key) continue;
    const key = row.trading_symbol.trim().toUpperCase();
    if (!map[key]) map[key] = row.instrument_key;
  }
  cache.maps[exchange] = map;
  return map;
}

/** Save (or clear) the signed-in user's own Upstox access token. */
export const saveUpstoxToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "").trim() }))
  .handler(async ({ data, context }) => {
    if (data.token.length > 4000) throw new Error("Token too long");
    const { error } = await context.supabase.from("broker_credentials").upsert(
      { user_id: context.userId, upstox_token: data.token || null },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, connected: data.token.length > 0 };
  });

/** Whether this user has a token stored (never returns the token itself). */
export const getUpstoxStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("broker_credentials")
      .select("upstox_token, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    const token = data?.upstox_token ?? "";
    return {
      connected: token.length > 0,
      hint: token ? `${token.slice(0, 6)}…${token.slice(-4)}` : "",
      updatedAt: data?.updated_at ?? null,
    };
  });

/** Latest traded price for a batch of NSE/BSE equity symbols. */
export const fetchUpstoxCmp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { symbols: Array<{ symbol: string; exchange: string }> }) => {
    const list = Array.isArray(data?.symbols) ? data.symbols.slice(0, 200) : [];
    return {
      symbols: list
        .map((s) => ({
          symbol: String(s?.symbol ?? "").trim().toUpperCase().slice(0, 40),
          exchange: String(s?.exchange ?? "NSE").trim().toUpperCase().slice(0, 10),
        }))
        .filter((s) => s.symbol),
    };
  })
  .handler(async ({ data, context }) => {
    const { data: cred } = await context.supabase
      .from("broker_credentials")
      .select("upstox_token")
      .eq("user_id", context.userId)
      .maybeSingle();
    const token = cred?.upstox_token;
    if (!token) return { error: "no-token" as const, prices: {} as Record<string, number> };

    const wanted = data.symbols.filter((s) => s.exchange === "NSE" || s.exchange === "BSE");
    if (!wanted.length) return { prices: {} as Record<string, number>, skipped: data.symbols.length };

    const keyBySymbol: Record<string, string> = {};
    for (const ex of ["NSE", "BSE"] as const) {
      const subset = wanted.filter((s) => s.exchange === ex);
      if (!subset.length) continue;
      const map = await loadInstruments(ex);
      for (const s of subset) {
        const k = map[s.symbol];
        if (k) keyBySymbol[`${s.exchange}:${s.symbol}`] = k;
      }
    }

    const keys = Object.values(keyBySymbol);
    if (!keys.length) return { prices: {} as Record<string, number>, unresolved: wanted.length };

    const prices: Record<string, number> = {};
    for (let i = 0; i < keys.length; i += 100) {
      const chunk = keys.slice(i, i + 100);
      const res = await fetch(
        `https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodeURIComponent(chunk.join(","))}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
      );
      if (res.status === 401 || res.status === 403) {
        return { error: "bad-token" as const, prices };
      }
      if (!res.ok) continue;
      const body = (await res.json()) as {
        data?: Record<string, { last_price?: number; instrument_token?: string }>;
      };
      const byKey: Record<string, number> = {};
      for (const [responseKey, entry] of Object.entries(body.data ?? {})) {
        if (typeof entry.last_price === "number") {
          // Upstox has returned both the requested instrument key and a
          // separate instrument_token across API versions. Keep both aliases
          // so symbol resolution remains reliable either way.
          byKey[responseKey] = entry.last_price;
          if (entry.instrument_token) byKey[entry.instrument_token] = entry.last_price;
        }
      }
      for (const [symKey, instKey] of Object.entries(keyBySymbol)) {
        const price = byKey[instKey];
        if (typeof price === "number") prices[symKey] = price;
      }
    }

    return { prices, fetchedAt: new Date().toISOString() };
  });
