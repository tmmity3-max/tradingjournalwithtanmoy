/**
 * TM Watchlist - Advanced Screener.in Assistant
 * Version 3.1 (Refactored & Modularized)
 */

import { Store } from './store.js';
import { SidebarInstance } from './sidebar.js';
import { Injector } from './injector.js';
import { Logger } from './logger.js';
import { TVToolbar } from './tv-toolbar.js';
import { startAutoSync } from './journal-sync.js';

const INIT_KEY = '__tmWatchlistInitialized';

if (globalThis[INIT_KEY]) {
  Logger.info('TM Watchlist: Already initialized.');
} else {
  globalThis[INIT_KEY] = true;

  (async function main() {
    Logger.info('TM Watchlist: Initializing...');
    
    // Initialize Store first
    await Store.init();
    
    // Initialize UI
    await SidebarInstance.init();
    
    // Initialize DOM Injector
    Injector.init();
    
    // Inject TradingView Bridge
    if (window.location.hostname.includes('tradingview.com')) {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('src/tv-inject.js');
      (document.head || document.documentElement).appendChild(script);
      Logger.info('TM Watchlist: TV Bridge Injected');

      // Native-looking toolbar button inside TradingView's own right toolbar
      TVToolbar.init();
    }

    // Push watchlists to an open journal tab every ~8s (no tab focus/reload).
    startAutoSync();

    Logger.info('TM Watchlist: Ready');
  })();
}
