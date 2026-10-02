import { STORAGE_KEYS } from './constants.js';
import { Logger } from './logger.js';

const defaultNifty50 = [
  'HDFCBANK', 'INFY', 'RELIANCE', 'SHRIRAMFIN', 'ICICIBANK', 'SBIN', 'ITC', 'LT', 'BHARTIARTL', 'M',
  'ETERNAL', 'BAJFINANCE', 'COALINDIA', 'TCS', 'TATASTEEL', 'MARUTI', 'AXISBANK', 'HINDALCO', 'POWERGRID', 'NTPC',
  'INDIGO', 'BEL', 'HCLTECH', 'SUNPHARMA', 'KOTAKBANK', 'ADANIPORTS', 'ONGC', 'APOLLOHOSP', 'HINDUNILVR', 'TECHM',
  'WIPRO', 'BAJAJFINSV', 'TMPV', 'DRREDDY', 'JSWSTEEL', 'TITAN', 'ULTRACEMCO', 'GRASIM', 'EICHERMOT', 'MAXHEALTH',
  'JIOFIN', 'SBILIFE', 'BAJAJ', 'TRENT', 'ADANIENT', 'TATACONSUM', 'ASIANPAINT', 'HDFCLIFE', 'NESTLEIND', 'CIPLA'
].map(ticker => ({ ticker, exchange: 'NSE', color: 'none', note: '', addedAt: Date.now() }));

/** Create a new section object. */
function makeSection(name) {
  return {
    id: 'sec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name,
    symbols: [],
    isCollapsed: false
  };
}

export const Store = {
  state: {
    isOpen: false,
    width: 350,
    watchlists: [
      {
        id: 'default',
        name: 'My Watchlist',
        sections: [makeSection('Main')],
        activeSectionId: null  // null = no active section (show all)
      },
      {
        id: 'nifty50',
        name: 'Nifty 50 stocks',
        sections: [
          { id: 'main_nifty50', name: 'Main', symbols: defaultNifty50, isCollapsed: false }
        ],
        activeSectionId: null
      }
    ],
    activeWatchlistId: 'nifty50',
    visited: [],
    settings: {
      theme: 'light',
      showColWatchlist: true,
      showColTv: true,
      logLevel: 'INFO',
      isCompact: false,
      upstoxAccessToken: '',
      showLiveBadges: true,
      journalUrl: 'https://tradingjournalwithtanmoy.vercel.app',
      linkCode: ''
    }
  },

  async init() {
    try {
      let data = await chrome.storage.local.get([STORAGE_KEYS.DATA]);

      if (!data[STORAGE_KEYS.DATA]) {
        const syncData = await chrome.storage.sync.get([STORAGE_KEYS.DATA]);
        if (syncData[STORAGE_KEYS.DATA]) {
          Logger.info("Migrating data from sync to local...");
          data = syncData;
        }
      }

      if (data[STORAGE_KEYS.DATA]) {
        this.state = { ...this.state, ...data[STORAGE_KEYS.DATA] };

        if (!this.state.settings.logLevel) this.state.settings.logLevel = 'INFO';

        // Migration: flat symbols[] (pre-sections) -> wrap in "Main" section
        this.state.watchlists.forEach(wl => {
          if (Array.isArray(wl.symbols)) {
            // Migrate flat symbols to sections
            const mainSection = wl.sections && wl.sections.length > 0
              ? wl.sections[0]
              : makeSection('Main');
            // Ensure all symbols have note field
            wl.symbols.forEach(sym => { if (!('note' in sym)) sym.note = ''; });
            mainSection.symbols = wl.symbols;
            wl.sections = [mainSection];
            delete wl.symbols;
            // Ensure activeSectionId
            if (typeof wl.activeSectionId === 'undefined') wl.activeSectionId = null;
          }
          // Ensure all symbols in sections have note field
          wl.sections.forEach(sec => {
            sec.symbols.forEach(sym => { if (!('note' in sym)) sym.note = ''; });
          });
        });

        // Migration: ensure isCompact exists
        if (typeof this.state.settings.isCompact === 'undefined') {
          this.state.settings.isCompact = false;
        }

        // Migration: ensure Upstox settings exist
        if (typeof this.state.settings.upstoxAccessToken === 'undefined') {
          this.state.settings.upstoxAccessToken = '';
        }
        if (typeof this.state.settings.showLiveBadges === 'undefined') {
          this.state.settings.showLiveBadges = true;
        }
        if (typeof this.state.settings.journalUrl === 'undefined' || !this.state.settings.journalUrl
            || this.state.settings.journalUrl.includes('lovable.app')) {
          this.state.settings.journalUrl = 'https://tradingjournalwithtanmoy.vercel.app';
        }
        if (typeof this.state.settings.linkCode === 'undefined') {
          this.state.settings.linkCode = '';
        }
      }

      Logger.setLevel(this.state.settings.logLevel);
      this.save();

      Logger.info(`[Store] Init complete. Loaded ${this.state.watchlists.length} watchlists.`);
      return this.state;
    } catch (e) {
      console.error("Failed to init store:", e);
      return this.state;
    }
  },

  save() {
    Logger.debug("[Store] Saving state to LOCAL storage...");
    const chromeApi = globalThis.chrome;
    if (!chromeApi?.storage?.local?.set) {
      Logger.warn("[Store] Storage API unavailable; skipping save.");
      this.applyTheme();
      Logger.setLevel(this.state.settings.logLevel);
      return;
    }

    try {
      chromeApi.storage.local.set({ [STORAGE_KEYS.DATA]: this.state }, () => {
        const lastError = chromeApi.runtime?.lastError;
        if (lastError) {
          Logger.error(`[Store] Save failed: ${lastError.message}`);
          console.error("Storage Error:", lastError);
        } else {
          Logger.debug("[Store] State saved successfully.");
        }
      });
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      if (message.includes("Extension context invalidated")) {
        Logger.warn("[Store] Extension context invalidated. The extension was reloaded in the background.");
        console.warn("[TM] Extension was updated or reloaded. Please refresh this page to save changes.");
      } else {
        Logger.error(`[Store] Save failed: ${message}`);
        console.error("Storage Error:", e);
      }
    }
    this.applyTheme();
    Logger.setLevel(this.state.settings.logLevel);
  },

  applyTheme() {
    if (this.state.settings.theme === 'dark') document.documentElement.setAttribute('data-et-theme', 'dark');
    else document.documentElement.removeAttribute('data-et-theme');
  },

  // --- WATCHLIST HELPERS ---
  get activeWatchlist() {
    if (this.state.activeWatchlistId === 'super') {
      // Virtual, computed-on-read watchlist. Its "symbols" arrays hold the
      // SAME object references as the real watchlists, so colour toggles,
      // note edits etc. (which mutate the symbol object in place) transparently
      // affect the underlying real watchlist too. It is never persisted itself.
      return {
        id: 'super',
        name: '\u2b50 Super Watchlist',
        isVirtual: true,
        sections: [{ id: 'super_main', name: 'Marked (Red + Green)', symbols: this.getSuperWatchlistItems(), isCollapsed: false }],
        activeSectionId: null
      };
    }
    return this.state.watchlists.find(w => w.id === this.state.activeWatchlistId) || this.state.watchlists[0];
  },

  /** All red/green-marked symbols across every real watchlist (live object refs, not copies). */
  getSuperWatchlistItems() {
    const items = [];
    this.state.watchlists.forEach(wl => {
      wl.sections.forEach(sec => {
        sec.symbols.forEach(sym => {
          if (sym.color === 'red' || sym.color === 'green') items.push(sym);
        });
      });
    });
    return items;
  },

  /** Find which real watchlist/section a ticker currently lives in (for Super Watchlist source tags). */
  findSymbolSource(ticker, exchange) {
    for (const wl of this.state.watchlists) {
      for (const sec of wl.sections) {
        if (sec.symbols.some(s => s.ticker === ticker && s.exchange === exchange)) {
          return { watchlistId: wl.id, watchlistName: wl.name, sectionId: sec.id };
        }
      }
    }
    return null;
  },

  /** Remove a ticker from wherever it lives across ALL real watchlists (used by Super Watchlist delete). */
  removeSymbolFromAnyWatchlist(ticker, exchange) {
    for (const wl of this.state.watchlists) {
      for (const sec of wl.sections) {
        const before = sec.symbols.length;
        sec.symbols = sec.symbols.filter(s => !(s.ticker === ticker && s.exchange === exchange));
        if (sec.symbols.length < before) { this.save(); return true; }
      }
    }
    return false;
  },

  /** Get the currently active section, or null if showing all. */
  getActiveSection(wl) {
    if (!wl) wl = this.activeWatchlist;
    if (!wl.activeSectionId) return null;
    return wl.sections.find(s => s.id === wl.activeSectionId) || null;
  },

  /** Total symbol count across all sections. */
  getTotalSymbolCount(wl) {
    if (!wl) wl = this.activeWatchlist;
    return wl.sections.reduce((sum, s) => sum + s.symbols.length, 0);
  },

  addWatchlist(name) {
    const id = 'wl_' + Date.now();
    this.state.watchlists.push({
      id,
      name,
      sections: [makeSection('Main')],
      activeSectionId: null
    });
    this.state.activeWatchlistId = id;
    this.save();
  },

  deleteWatchlist(id) {
    if (this.state.watchlists.length <= 1) throw new Error("Cannot delete the last watchlist.");
    this.state.watchlists = this.state.watchlists.filter(w => w.id !== id);
    this.state.activeWatchlistId = this.state.watchlists[0].id;
    this.save();
  },

  clearWatchlist(id) {
    const wl = this.state.watchlists.find(w => w.id === id);
    if (wl) { wl.sections.forEach(s => s.symbols = []); this.save(); }
  },

  // --- SECTION ACTIONS ---

  /** Add a new section to a watchlist. */
  addSection(name = 'New Section') {
    const wl = this.activeWatchlist;
    const section = makeSection(name);
    wl.sections.push(section);
    this.save();
    return section;
  },

  /** Delete a section. If it's not the last section, move its symbols to Main. */
  deleteSection(sectionId) {
    const wl = this.activeWatchlist;
    if (wl.sections.length <= 1) return false;
    const idx = wl.sections.findIndex(s => s.id === sectionId);
    if (idx === -1) return false;
    const mainSection = wl.sections.find(s => s.name === 'Main') || wl.sections[0];
    // Move symbols to main section (only if different)
    if (sectionId !== mainSection.id) {
      mainSection.symbols.push(...wl.sections[idx].symbols);
    }
    wl.sections.splice(idx, 1);
    // Clear active section if it was deleted
    if (wl.activeSectionId === sectionId) wl.activeSectionId = null;
    this.save();
    return true;
  },

  /** Rename a section. */
  renameSection(sectionId, newName) {
    const wl = this.activeWatchlist;
    const sec = wl.sections.find(s => s.id === sectionId);
    if (sec) { sec.name = newName; this.save(); }
  },

  /** Toggle collapse state of a section. */
  toggleSectionCollapse(sectionId) {
    const wl = this.activeWatchlist;
    const sec = wl.sections.find(s => s.id === sectionId);
    if (sec) { sec.isCollapsed = !sec.isCollapsed; this.save(); }
  },

  /** Set active section (null = show all). */
  setActiveSection(sectionId) {
    const wl = this.activeWatchlist;
    wl.activeSectionId = sectionId || null;
    this.save();
  },

  // --- SYMBOL HELPERS ---

  /** Find which section contains a ticker. If sectionId is given, only that
   *  section is searched — needed because the same ticker can exist in more
   *  than one section, and callers that already know which row was clicked
   *  (colour toggle, notes) must not silently mutate a different section's copy. */
  _findSymbolSection(wl, ticker, sectionId) {
    if (!wl) wl = this.activeWatchlist;
    if (sectionId) {
      const sec = wl.sections.find(s => s.id === sectionId);
      if (!sec) return null;
      const sym = sec.symbols.find(s => s.ticker === ticker);
      return sym ? { section: sec, symbol: sym } : null;
    }
    for (const sec of wl.sections) {
      const sym = sec.symbols.find(s => s.ticker === ticker);
      if (sym) return { section: sec, symbol: sym };
    }
    return null;
  },

  /** Total symbol count */
  _totalSymbols(wl) {
    return wl.sections.reduce((sum, s) => sum + s.symbols.length, 0);
  },

  // --- SYMBOL ACTIONS ---

  /** Add symbol to the active section (or first section if none active). */
  addSymbol(ticker, exchange, note = '') {
    const wl = this.activeWatchlist;
    const targetSec = this.getActiveSection(wl) || wl.sections[0];
    targetSec.symbols.unshift({ ticker, exchange, color: 'none', note, addedAt: Date.now() });
    this.save();
    return true;
  },

  /** Add ticker to a specific watchlist's first section. */
  addSymbolToWatchlist(watchlistId, ticker, exchange, note = '') {
    const wl = this.state.watchlists.find(w => w.id === watchlistId);
    if (!wl) return false;
    wl.sections[0].symbols.unshift({ ticker, exchange, color: 'none', note, addedAt: Date.now() });
    this.save();
    return true;
  },

  /** Add symbol to a specific section. */
  addSymbolToSection(sectionId, ticker, exchange, note = '') {
    const wl = this.activeWatchlist;
    const sec = wl.sections.find(s => s.id === sectionId);
    if (!sec) return false;
    sec.symbols.unshift({ ticker, exchange, color: 'none', note, addedAt: Date.now() });
    this.save();
    return true;
  },

  /** Remove ticker from wherever it lives in the active watchlist. */
  removeSymbol(ticker) {
    const wl = this.activeWatchlist;
    for (const sec of wl.sections) {
      const before = sec.symbols.length;
      sec.symbols = sec.symbols.filter(s => s.ticker !== ticker);
      if (sec.symbols.length < before) { this.save(); return; }
    }
  },

  /** Remove ticker from a specific section. */
  removeSymbolFromSection(sectionId, ticker) {
    const wl = this.activeWatchlist;
    const sec = wl.sections.find(s => s.id === sectionId);
    if (!sec) return;
    sec.symbols = sec.symbols.filter(s => s.ticker !== ticker);
    this.save();
  },

  /** Add multiple symbols (paste import). Goes to active section. */
  addSymbols(items) {
    const wl = this.activeWatchlist;
    const targetSec = this.getActiveSection(wl) || wl.sections[0];
    const enriched = items.map(s => ({
      ticker: s.ticker,
      exchange: s.exchange,
      color: 'none',
      note: s.note || '',
      addedAt: Date.now()
    }));
    targetSec.symbols.unshift(...enriched);
    this.save();
    return items.length;
  },

  /** Toggle colour for a ticker. Pass sectionId when known (row click) so the
   *  right instance is updated even if the same ticker exists in another section. */
  toggleColor(ticker, sectionId) {
    const found = this._findSymbolSection(null, ticker, sectionId);
    if (found) {
      const colors = ['none', 'red', 'yellow', 'green'];
      const idx = colors.indexOf(found.symbol.color || 'none');
      found.symbol.color = colors[(idx + 1) % colors.length];
      this.save();
    }
  },

  /** Sort active section by colour: red -> yellow -> green -> none. */
  sortByColor() {
    const wl = this.activeWatchlist;
    const order = { red: 0, yellow: 1, green: 2, none: 3 };
    const targetSec = this.getActiveSection(wl) || wl.sections[0];
    targetSec.symbols.sort((a, b) => (order[a.color] ?? 3) - (order[b.color] ?? 3));
    this.save();
  },

  /** Move a symbol within a section (drag-and-drop). */
  reorderSymbol(fromIndex, toIndex, sectionId) {
    const wl = this.activeWatchlist;
    const sec = sectionId
      ? wl.sections.find(s => s.id === sectionId)
      : (this.getActiveSection(wl) || wl.sections[0]);
    if (!sec) return;
    if (fromIndex < 0 || fromIndex >= sec.symbols.length) return;
    if (toIndex < 0 || toIndex >= sec.symbols.length) return;
    const [item] = sec.symbols.splice(fromIndex, 1);
    sec.symbols.splice(toIndex, 0, item);
    this.save();
  },

  /** Move a ticker from its current section to a target section. */
  moveSymbolToSection(ticker, targetSectionId) {
    const wl = this.activeWatchlist;
    // Find where it currently lives
    const found = this._findSymbolSection(wl, ticker);
    if (!found) return;
    // Find target section
    const targetSec = wl.sections.find(s => s.id === targetSectionId);
    if (!targetSec) return;
    // Remove from source
    found.section.symbols = found.section.symbols.filter(s => s.ticker !== ticker);
    // Add to target
    targetSec.symbols.unshift(found.symbol);
    this.save();
  },

  /** Move a ticker from any watchlist/section to a target watchlist's target section. */
  moveSymbolAcrossWatchlists(targetWatchlistId, targetSectionId, ticker, exchange) {
    // 1. Remove from wherever it currently lives
    for (const wl of this.state.watchlists) {
      for (const sec of wl.sections) {
        const idx = sec.symbols.findIndex(s => s.ticker === ticker && s.exchange === exchange);
        if (idx !== -1) {
          const [sym] = sec.symbols.splice(idx, 1);
          // 2. Add to target watchlist + section
          const targetWl = this.state.watchlists.find(w => w.id === targetWatchlistId);
          if (targetWl) {
            const targetSec = targetWl.sections.find(s => s.id === targetSectionId) || targetWl.sections[0];
            // Avoid duplicate in target
            if (!targetSec.symbols.some(s => s.ticker === ticker && s.exchange === exchange)) {
              targetSec.symbols.unshift(sym);
            }
          }
          break;
        }
      }
    }
    this.save();
  },

  /** Update the note for a ticker. Pass sectionId when known (row click) so the
   *  right instance is updated even if the same ticker exists in another section. */
  updateNote(ticker, note, sectionId) {
    const found = this._findSymbolSection(null, ticker, sectionId);
    if (found) { found.symbol.note = note; this.save(); }
  },

  /** Toggle compact mode. */
  toggleCompact() {
    this.state.settings.isCompact = !this.state.settings.isCompact;
    this.save();
  },

  /** Save the Upstox API access token (regenerated daily via Upstox developer login). */
  setUpstoxToken(token) {
    this.state.settings.upstoxAccessToken = (token || '').trim();
    this.save();
  },

  /** Toggle the "prev-day-high arrow" + "relative volume" badges on/off. */
  toggleLiveBadges() {
    this.state.settings.showLiveBadges = !this.state.settings.showLiveBadges;
    this.save();
  },

  // --- IMPORT/EXPORT ---
  importCSV(csvText) {
    const tokens = csvText.split(/[\n,]+/).map(t => t.trim()).filter(t => t);
    let count = 0;
    tokens.forEach(token => {
      const [p1, p2] = token.split(':').map(s => s.trim().toUpperCase());
      if (p1 && p2) {
        const ex = (p1 === 'NSE' || p1 === 'BSE') ? p1 : (p2 === 'NSE' || p2 === 'BSE') ? p2 : 'NSE';
        const tick = (p1 !== ex) ? p1 : p2;
        if (this.addSymbol(tick, ex)) count++;
      } else if (p1) {
        if (this.addSymbol(p1, 'NSE')) count++;
      }
    });
    return count;
  },

  markVisited(ticker) {
    if (!this.state.visited.includes(ticker)) {
      this.state.visited.push(ticker);
      this.save();
    }
  },

  isVisited(ticker) { return this.state.visited.includes(ticker); }
};
