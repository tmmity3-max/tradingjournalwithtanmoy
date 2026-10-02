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

const DEFAULT_JOURNAL_URL = 'https://tradingjournalwithtanmoy.vercel.app';
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
    let base = (Store.state.settings.journalUrl || DEFAULT_JOURNAL_URL).replace(/\/+$/, '');
    // Always open the dashboard so auth + sync layer are active.
    if (!/\/dashboard\/?$/.test(base)) base = base + '/dashboard';
    return base;
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

  /**
   * Ask the background service worker to run a task.
   *
   * Content scripts only get a slice of the Chrome API (runtime, storage,
   * i18n) — `chrome.tabs` and `chrome.scripting` are undefined here, so
   * every tab operation has to be relayed to the worker.
   */
  send(action, extra = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, ...extra }, (response) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        if (!response) return reject(new Error('No response from the extension service worker.'));
        if (response.error) return reject(new Error(response.error));
        resolve(response);
      });
    });
  },

  /** Open the journal site, focusing the existing tab if one is already open. */
  async openJournal() {
    const url = this.url();
    if (!url) throw new Error('No journal URL configured.');
    const { tabId } = await this.send('JOURNAL_OPEN', { url });
    return tabId;
  },

  /**
   * Write the current watchlists into the journal page's localStorage.
   * The worker owns the tab, the load wait and the script injection.
   */
  async connect() {
    const url = this.url();
    if (!url) throw new Error('No journal URL configured.');

    const payload = this.toPayload();
    const settings = { ...DEFAULT_WL_SETTINGS };

    const result = await this.send('JOURNAL_SYNC', {
      url,
      wlKey: WL_KEY,
      wlSetKey: WL_SET_KEY,
      payload,
      settings
    });

    const { lists, items } = result;
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


/** Auto-push watchlists to an open journal tab every 8 seconds. */
let _autoSyncStarted = false;
export function startAutoSync() {
  if (_autoSyncStarted) return;
  _autoSyncStarted = true;
  const tick = () => {
    try {
      chrome.runtime.sendMessage({ action: 'JOURNAL_AUTO_SYNC' }, () => {
        void chrome.runtime.lastError; // ignore if SW waking
      });
    } catch (e) {}
  };
  // First run after a short delay, then every 8s
  setTimeout(tick, 3000);
  setInterval(tick, 8000);
}
