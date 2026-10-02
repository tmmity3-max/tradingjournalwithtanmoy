import { Store } from '../store.js';
import { Logger } from '../logger.js';

// ─────────────────────────────────────────────────────────────────
//  UPSTOX MARKET DATA SERVICE
//
//  Provides two derived indicators per symbol, shown as watchlist badges:
//   - crossed:  true  -> LTP has crossed above the previous trading day's high
//               false -> it has not
//               null  -> unknown (no token / symbol not found / not fetched yet)
//   - rvol:     today's traded volume so far / average of the last 10 trading
//               days' full-day volume. A simple, non-time-adjusted relative
//               volume approximation (not intraday-pace-adjusted).
//
//  Requires a Upstox Access Token (Settings -> Market Data). Tokens are
//  generated via Upstox's own developer login flow and expire daily around
//  3:30am IST, so this deliberately does NOT attempt an in-extension OAuth
//  flow — the user pastes a fresh token when needed.
// ─────────────────────────────────────────────────────────────────

const QUOTE_STALE_MS = 45 * 1000;       // re-fetch live quote if older than this
// v2 -> bumped: the old resolveInstrumentKey() could fall back to a wrong
// instrument when no exact ticker match was found, and cache that wrong
// mapping forever. Renaming the storage key throws away any such bad
// mappings so everything re-resolves under the corrected exact-match logic.
const KEYMAP_STORAGE_KEY = 'et_upstox_keymap_v2';  // ticker -> instrument_key cache (long-lived)
const PREVDAY_STORAGE_KEY = 'et_upstox_prevday';   // per-symbol prev-day stats, keyed by calendar date
const BATCH_SIZE = 40;                  // instrument_keys per /market-quote/quotes call

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

function cacheKey(ticker, exchange) { return `${exchange}:${ticker}`; }

export const UpstoxService = {
  _keyMap: null,          // { "NSE:RELIANCE": "NSE_EQ|INE..." }
  _keyMapLoaded: false,
  _prevDayCache: null,    // { "NSE_EQ|INE...": { date, high, avgVolume } }
  _quoteCache: new Map(), // cacheKey -> { ltp, volume, ts }
  _resolvedNone: new Set(), // tickers we tried and could not resolve (avoid hammering search API)
  _inFlight: new Set(),   // cacheKeys currently being fetched
  lastError: '',

  isConfigured() {
    return !!(Store.state.settings.upstoxAccessToken && Store.state.settings.showLiveBadges);
  },

  _token() { return Store.state.settings.upstoxAccessToken; },

  /** Low-level: relay a GET through background.js so it isn't subject to page CORS. */
  _fetch(url) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ action: 'UPSTOX_FETCH', url, token: this._token() }, res => {
          const lastErr = chrome.runtime?.lastError;
          if (lastErr) return reject(new Error(lastErr.message));
          if (!res || !res.success) return reject(new Error(res?.error || 'Upstox request failed'));
          resolve(res.data);
        });
      } catch (e) { reject(e); }
    });
  },

  async _loadKeyMap() {
    if (this._keyMapLoaded) return;
    this._keyMapLoaded = true;
    try {
      const stored = await chrome.storage.local.get([KEYMAP_STORAGE_KEY]);
      this._keyMap = stored[KEYMAP_STORAGE_KEY] || {};
    } catch (e) {
      this._keyMap = {};
    }
  },

  async _saveKeyMap() {
    try { await chrome.storage.local.set({ [KEYMAP_STORAGE_KEY]: this._keyMap }); } catch (e) { /* ignore */ }
  },

  async _loadPrevDayCache() {
    if (this._prevDayCache) return;
    try {
      const stored = await chrome.storage.local.get([PREVDAY_STORAGE_KEY]);
      this._prevDayCache = stored[PREVDAY_STORAGE_KEY] || {};
    } catch (e) {
      this._prevDayCache = {};
    }
  },

  async _savePrevDayCache() {
    try { await chrome.storage.local.set({ [PREVDAY_STORAGE_KEY]: this._prevDayCache }); } catch (e) { /* ignore */ }
  },

  /** Resolve a ticker+exchange to an Upstox instrument_key, via the Search Instruments API (cached). */
  async resolveInstrumentKey(ticker, exchange) {
    await this._loadKeyMap();
    const ck = cacheKey(ticker, exchange);
    if (this._keyMap[ck]) return this._keyMap[ck];
    if (this._resolvedNone.has(ck)) return null;

    try {
      const url = `https://api.upstox.com/v2/instruments/search?query=${encodeURIComponent(ticker)}&exchanges=${exchange}&segments=EQ&records=20&page_number=1`;
      const json = await this._fetch(url);
      const list = json?.data || [];
      // IMPORTANT: only accept an EXACT trading_symbol + exchange match. The
      // old code fell back to list[0] (Upstox's top fuzzy-search hit) when no
      // exact match was in range — that silently mapped the ticker to whatever
      // similarly-named instrument search ranked first, and cached that wrong
      // mapping permanently, producing plausible-looking but wrong badges
      // (e.g. a "crossed below" arrow on a stock that's actually made a new
      // high, because the badge was really tracking a different instrument).
      // No exact match now correctly means "unresolved" rather than "guess".
      const hit = list.find(i =>
        (i.trading_symbol || '').toUpperCase() === ticker.toUpperCase() &&
        (i.exchange || '').toUpperCase() === exchange.toUpperCase()
      );
      if (hit?.instrument_key) {
        this._keyMap[ck] = hit.instrument_key;
        this._saveKeyMap();
        return hit.instrument_key;
      }
      Logger.warn(`[Upstox] No exact match for ${ck} among ${list.length} search results — leaving unresolved.`);
      this._resolvedNone.add(ck);
      return null;
    } catch (e) {
      Logger.warn(`[Upstox] Could not resolve ${ck}: ${e.message}`);
      this.lastError = e.message;
      return null;
    }
  },

  /** Fetch (and cache for the trading day) the previous day's high + a 10-day average volume baseline. */
  async _ensurePrevDayStats(instrumentKey) {
    await this._loadPrevDayCache();
    const today = todayStr();
    const cached = this._prevDayCache[instrumentKey];
    if (cached && cached.date === today) return cached;

    try {
      const to = new Date();
      to.setDate(to.getDate() - 1); // up to yesterday
      const from = new Date(to);
      from.setDate(from.getDate() - 20); // 20 calendar days back is enough for ~10 trading days
      const fmt = d => d.toISOString().slice(0, 10);
      // v2 historical-candle is being phased out by Upstox in favor of v3 (custom
      // unit/interval path segments) — using v2 here was returning errors/empty data.
      const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/days/1/${fmt(to)}/${fmt(from)}`;
      const json = await this._fetch(url);
      const candles = json?.data?.candles || []; // [ts, open, high, low, close, volume, oi], newest first
      if (!candles.length) return null;

      const prevHigh = candles[0][2];
      const volSample = candles.slice(0, 10).map(c => c[5]).filter(v => typeof v === 'number' && v > 0);
      const avgVolume = volSample.length ? volSample.reduce((a, b) => a + b, 0) / volSample.length : null;

      const stats = { date: today, high: prevHigh, avgVolume };
      this._prevDayCache[instrumentKey] = stats;
      this._savePrevDayCache();
      return stats;
    } catch (e) {
      Logger.warn(`[Upstox] Prev-day stats failed for ${instrumentKey}: ${e.message}`);
      this.lastError = e.message;
      return null;
    }
  },

  /** Synchronous read of whatever's cached right now (for instant paint before the async refresh lands). */
  getCached(ticker, exchange) {
    const ck = cacheKey(ticker, exchange);
    const q = this._quoteCache.get(ck);
    if (!q) return null;
    const instrumentKey = this._keyMap?.[ck];
    const prevDay = instrumentKey ? this._prevDayCache?.[instrumentKey] : null;
    return this._computeIndicators(q, prevDay);
  },

  _computeIndicators(quote, prevDay) {
    if (!quote) return null;
    const crossed = prevDay?.high != null ? quote.ltp > prevDay.high : null;
    const rvol = (prevDay?.avgVolume && quote.volume != null) ? (quote.volume / prevDay.avgVolume) : null;
    return { crossed, rvol, ltp: quote.ltp };
  },

  /**
   * Refresh quotes + indicators for a list of {ticker, exchange} pairs.
   * Calls onUpdate(cacheKey, indicators) for each symbol once fresh data lands.
   * Safe to call repeatedly (e.g. on every render) — internally throttled.
   */
  async refreshBatch(items, onUpdate) {
    if (!this.isConfigured() || !items?.length) return;
    await this._loadKeyMap();
    await this._loadPrevDayCache();

    const now = Date.now();
    const need = items.filter(it => {
      const ck = cacheKey(it.ticker, it.exchange);
      if (this._inFlight.has(ck)) return false;
      const cached = this._quoteCache.get(ck);
      return !cached || (now - cached.ts) > QUOTE_STALE_MS;
    });
    if (!need.length) return;
    need.forEach(it => this._inFlight.add(cacheKey(it.ticker, it.exchange)));

    try {
      // Resolve instrument keys (cheap once cached).
      const resolved = [];
      for (const it of need) {
        const key = await this.resolveInstrumentKey(it.ticker, it.exchange);
        if (key) resolved.push({ ...it, key });
      }
      if (!resolved.length) return;

      // Batch fetch live quotes.
      for (let i = 0; i < resolved.length; i += BATCH_SIZE) {
        const chunk = resolved.slice(i, i + BATCH_SIZE);
        const instrumentKeys = chunk.map(c => c.key).join(',');
        let json;
        try {
          json = await this._fetch(`https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKeys)}`);
        } catch (e) {
          this.lastError = e.message;
          Logger.warn(`[Upstox] Quote batch failed: ${e.message}`);
          continue;
        }
        const data = json?.data || {};
        for (const c of chunk) {
          const ck = cacheKey(c.ticker, c.exchange);
          const entry = Object.values(data).find(d => d.instrument_token === c.key);
          if (!entry) continue;
          this._quoteCache.set(ck, { ltp: entry.last_price, volume: entry.volume, ts: Date.now() });

          // Kick off (cached) prev-day stats lookup, then report combined indicators.
          this._ensurePrevDayStats(c.key).then(prevDay => {
            const indicators = this._computeIndicators(this._quoteCache.get(ck), prevDay);
            if (indicators && onUpdate) onUpdate(ck, indicators);
          });
        }
      }
    } finally {
      need.forEach(it => this._inFlight.delete(cacheKey(it.ticker, it.exchange)));
    }
  },

  /**
   * Lightweight connectivity check used by the Settings "Test Connection" button.
   *
   * Deliberately hits a Market Data endpoint (Instruments Search) rather than
   * /v2/user/profile: the profile/account endpoints require a Static IP to be
   * configured on the app before an Analytics Token can use them, so testing
   * against them made a perfectly working Analytics Token look "broken" here
   * even though the actual badge-fetching calls (which only use market data)
   * would have worked fine.
   */
  async testConnection() {
    if (!this._token()) return { ok: false, message: 'No access token set.' };
    try {
      const json = await this._fetch('https://api.upstox.com/v2/instruments/search?query=RELIANCE&exchanges=NSE&segments=EQ&records=1&page_number=1');
      const hit = json?.data?.[0];
      return hit
        ? { ok: true, message: `Connected (market data OK).` }
        : { ok: false, message: 'Connected, but no instrument data returned — check token scope.' };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }
};
