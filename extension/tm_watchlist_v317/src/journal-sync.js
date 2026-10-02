import { Store } from './store.js';
import { Logger } from './logger.js';

/**
 * JournalSync
 *
 * Bridges the extension's watchlists into the Trading Journal site.
 *
 * The site keeps watchlists under two localStorage keys, which its own
 * sync layer (src/lib/journal-sync.ts) mirrors to Firestore, so anything we
 * write there is automatically available on every signed-in device:
 *
 *   tj_watchlists  -> { lists: [{ name, items: [{ ticker, exchange, color }] }] }
 *   tj_wl_settings -> { defaultList, defaultFlag, sort, showTradingView, showScreener }
 *
 * A content script can't touch another origin's localStorage, so we write
 * through a script injected into the journal tab itself.
 */

const DEFAULT_JOURNAL_URL = 'https://tradingjournalwithtanmoy.lovable.app';
const WL_KEY = 'tj_watchlists';
const WL_SET_KEY = 'tj_wl_settings';

const DEFAULT_WL_SETTINGS = {
  defaultList: '',
  defaultFlag: '',
  sort: 'manual',
  showTradingView: true,
  showScreener: true
};

export const JournalSync = {
  DEFAULT_JOURNAL_URL,
  WL_KEY,
  WL_SET_KEY,

  url() {
    return Store.state.settings.journalUrl || DEFAULT_JOURNAL_URL;
  },

  setUrl(url) {
    const clean = (url || '').trim().replace(/\/+$/, '');
    Store.state.settings.journalUrl = clean || DEFAULT_JOURNAL_URL;
    Store.save();
    return Store.state.settings.journalUrl;
  },

  isConfigured() {
    return !!this.url();
  },

  /** Extension watchlist state -> the exact shape the site's Watchlist tab reads. */
  toPayload() {
    return {
      lists: Store.state.watchlists
        .filter(wl => !wl.isVirtual)
        .map(wl => ({
          name: wl.name,
          items: wl.sections.flatMap(sec =>
            sec.symbols.map(s => ({
              ticker: s.ticker,
              exchange: s.exchange,
              color: s.color || 'none',
              note: s.note || ''
            }))
          )
        }))
    };
  },

  symbolCount() {
    return Store.state.watchlists
      .filter(wl => !wl.isVirtual)
      .reduce((n, wl) => n + wl.sections.reduce((m, s) => m + s.symbols.length, 0), 0);
  },

  /** Open the journal site, focusing the existing tab if one is already open. */
  async openJournal() {
    const url = this.url();
    if (!url) throw new Error('No journal URL configured.');

    const existing = await chrome.tabs.query({ url: `${url}/*` });
    if (existing && existing.length) {
      await chrome.tabs.update(existing[0].id, { active: true });
      await chrome.windows.update(existing[0].windowId, { focused: true });
      return existing[0].id;
    }
    const tab = await chrome.tabs.create({ url, active: true });
    return tab.id;
  },

  /** Resolve once the tab has finished loading, so localStorage writes aren't wiped by a late load. */
  waitForLoad(tabId, timeoutMs = 15000) {
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      };
      const listener = (id, info) => {
        if (id === tabId && info.status === 'complete') done();
      };
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.get(tabId, t => (t && t.status === 'complete' ? done() : null));
      const timer = setTimeout(done, timeoutMs);
    });
  },

  /**
   * Write the current watchlists into the journal page's localStorage.
   * Returns a short status string for the UI.
   */
  async connect() {
    const url = this.url();
    if (!url) throw new Error('No journal URL configured.');

    const payload = this.toPayload();
    const settings = { ...DEFAULT_WL_SETTINGS };

    const tabId = await this.openJournal();
    await this.waitForLoad(tabId);

    const [injected] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [WL_KEY, WL_SET_KEY, payload, settings],
      func: (wlKey, wlSetKey, wlPayload, wlSettings) => {
        // The site's own sync layer picks these up within its next poll.
        localStorage.setItem(wlKey, JSON.stringify(wlPayload));
        localStorage.setItem(wlSetKey, JSON.stringify(wlSettings));
        return {
          lists: wlPayload.lists.length,
          items: wlPayload.lists.reduce((n, l) => n + l.items.length, 0)
        };
      }
    });

    if (!injected || injected.result === undefined) {
      throw new Error('Could not write to the page. Is the journal open and not blocked?');
    }

    // Reload so the Watchlist tab renders the new data immediately.
    await chrome.tabs.reload(tabId);

    const { lists, items } = injected.result;
    Logger.info(`[JournalSync] Synced ${lists} list(s), ${items} symbol(s) to ${url}`);

    chrome.storage.local.set({ lastJournalSync: { at: Date.now(), lists, items, url } });
    return { lists, items };
  },

  /** Last sync result, for showing "Last synced 5 min ago" in Settings. */
  async lastSync() {
    const res = await chrome.storage.local.get(['lastJournalSync']);
    return res.lastJournalSync || null;
  },

  humanSince(ts) {
    if (!ts) return 'never';
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 min ago';
    if (mins < 60) return `${mins} mins ago`;
    const hrs = Math.round(mins / 60);
    return hrs === 1 ? '1 hour ago' : `${hrs} hours ago`;
  }
};
