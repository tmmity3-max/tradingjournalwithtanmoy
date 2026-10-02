/**
 * General Utilities
 */
import { Logger } from './logger.js';

export const Utils = {
  extractTickerFromUrl(url) {
    const match = url.match(/\/company\/([^/]+)\//);
    return match ? match[1].toUpperCase() : null;
  },

  async getBseCache() {
    return new Promise(resolve => {
      chrome.storage.local.get(['et_bse_cache'], (res) => {
        resolve(res.et_bse_cache || {});
      });
    });
  },

  async setBseCacheItem(ticker, resolved) {
    const cache = await this.getBseCache();
    cache[ticker] = resolved;
    return new Promise(resolve => {
      chrome.storage.local.set({ 'et_bse_cache': cache }, resolve);
    });
  },

  /**
   * Parses a raw pasted text string (from Chartink, WhatsApp, notes, etc.)
   * into an array of { ticker, exchange } objects.
   *
   * Handles:
   *   - Comma-separated:  "TCS, INFY, RELIANCE"
   *   - Space-separated:  "TCS INFY RELIANCE"
   *   - Newline-separated (one per line)
   *   - Mixed:            "TCS,INFY RELIANCE\nSBI"
   *   - With exchange:    "NSE:TCS, BSE:INFY"
   *   - Junk / numbers:   silently skipped
   *
   * Returns: Array<{ ticker: string, exchange: string }>
   */
  parsePasteText(rawText) {
    if (!rawText || !rawText.trim()) return [];

    // Split on comma, whitespace, or newline — any combo
    const tokens = rawText
      .split(/[\s,\n\r]+/)
      .map(t => t.trim().toUpperCase())
      .filter(t => t.length > 0);

    const results = [];
    const seen = new Set();

    for (const token of tokens) {
      // Handle "EXCHANGE:TICKER" format (e.g. NSE:TCS)
      if (token.includes(':')) {
        const [left, right] = token.split(':').map(s => s.trim());
        const knownExchanges = ['NSE', 'BSE', 'NSI'];
        if (knownExchanges.includes(left) && right && /^[A-Z0-9&._\-]{1,20}$/.test(right)) {
          const key = `${left}:${right}`;
          if (!seen.has(key)) { seen.add(key); results.push({ ticker: right, exchange: left }); }
        } else if (knownExchanges.includes(right) && left && /^[A-Z0-9&._\-]{1,20}$/.test(left)) {
          const key = `${right}:${left}`;
          if (!seen.has(key)) { seen.add(key); results.push({ ticker: left, exchange: right }); }
        }
        continue;
      }

      // Plain ticker — must be 1-20 chars, only letters/digits/allowed symbols, no pure numbers
      if (
        /^[A-Z][A-Z0-9&._\-]{0,19}$/.test(token) && // starts with letter
        !/^\d+$/.test(token)                          // not pure digits
      ) {
        const key = `NSE:${token}`;
        if (!seen.has(key)) { seen.add(key); results.push({ ticker: token, exchange: 'NSE' }); }
      }
    }

    return results;
  },

  /**
   * Resolves a symbol. If it's all digits, assumes it's a BSE code and tries to fetch the ticker.
   */
  async resolveSymbol(rawTicker) {
    if (!/^\d+$/.test(rawTicker)) return { ticker: rawTicker, exchange: 'NSE' };
    
    const cache = await this.getBseCache();
    if (cache[rawTicker]) return { ticker: cache[rawTicker], exchange: 'BSE' };
    
    Logger.debug(`[BSE Resolve] Starting resolution for: ${rawTicker}`);

    try {
      const result = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'FETCH_PAGE', url: `https://www.screener.in/company/${rawTicker}/` }, resolve);
      });

      if (!result || !result.success) {
          Logger.warn(`[BSE Resolve] Fetch failed for ${rawTicker}: ${result?.error}`);
          return { ticker: rawTicker, exchange: 'BSE' };
      }

      const { text: html, url: finalUrl, status } = result.data;
      Logger.debug(`[BSE Resolve] Fetch status: ${status} for ${rawTicker}`);
      
      let resolved = null;

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const links = doc.querySelectorAll('.company-links a[href*="bseindia.com/stock-share-price"]');
        for (const link of links) {
          const href = link.getAttribute("href");
          const match = href.match(/stock-share-price\/[^/]+\/([^/]+)\//);
          if (match) { resolved = match[1].toUpperCase(); break; }
        }
      } catch (parseErr) {
        Logger.warn("[BSE Resolve] Error parsing HTML for BSE link:", parseErr);
      }

      if (!resolved) {
         try {
             if (finalUrl && !finalUrl.includes(rawTicker)) {
                const match = finalUrl.match(/\/company\/([^/]+)\//);
                if (match) resolved = match[1].toUpperCase();
             }
         } catch (e) { Logger.warn("[BSE Resolve] Strategy 2 error:", e); }
      }

      if (!resolved) {
          const match = html.match(/company\/([A-Z0-9]+)\/consolidated/) || html.match(/company\/([A-Z0-9]+)\//);
          if (match) resolved = match[1].toUpperCase();
      }
      
      resolved = resolved || rawTicker;
      await this.setBseCacheItem(rawTicker, resolved);
      return { ticker: resolved, exchange: 'BSE' };
    } catch (e) {
      Logger.error("Error resolving symbol:", e);
      return { ticker: rawTicker, exchange: 'BSE' };
    }
  },

  debounce(func, wait) {
    let timeout;
    return function (...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  },

  /**
   * Asks the injected TradingView bridge (tv-inject.js) what symbol/exchange
   * is actually loaded on the chart right now, e.g. "NSE:GODREJPROP".
   * Returns null if unavailable (bridge not present, API not ready, or timeout).
   * This is authoritative — unlike guessing the exchange from an external
   * ticker lookup, it reflects exactly what the user is looking at.
   */
  getCurrentTvSymbolFromApi() {
    return new Promise(resolve => {
      let done = false;
      const handler = (e) => {
        if (done) return;
        done = true;
        document.removeEventListener('et_current_symbol_response', handler);
        resolve(e.detail && e.detail.symbol ? e.detail.symbol : null);
      };
      document.addEventListener('et_current_symbol_response', handler);
      document.dispatchEvent(new CustomEvent('et_request_current_symbol'));
      setTimeout(() => {
        if (done) return;
        done = true;
        document.removeEventListener('et_current_symbol_response', handler);
        resolve(null);
      }, 400);
    });
  },

  getSymbolFromPage() {
    const title = document.title.trim();
    const m = title.match(/^([A-Z0-9&._\-]+)/);
    if (m && m[1].length > 1 && !['TRADINGVIEW', 'TV', 'HTTP', 'HTTPS', 'SCREENER', 'KITE', 'ZERODHA'].includes(m[1])) {
      return m[1];
    }

    const urlSym = new URLSearchParams(window.location.search).get('symbol');
    if (urlSym) return urlSym.split(':').pop();

    const screenerMatch = window.location.pathname.match(/\/company\/([A-Z0-9&._\-]+)\//i);
    if (screenerMatch) return screenerMatch[1].toUpperCase();

    const selectors = [
      '[data-symbol-short]', '.tv-symbol-header__first-line',
      '.chart-header-symbol-title', '.ticker',
      '[class*="symbolTitle"]', '[class*="symbol-title"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.getAttribute('data-symbol-short') || el.innerText || '').trim().split(/[\s:]/)[0];
        if (text && text.length > 1) return text.toUpperCase();
      }
    }
    return null;
  },

  async getStockExchange(symbol) {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}`;
    try {
        const result = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'FETCH_PAGE', url }, resolve);
        });
        if (!result || !result.success) return null;
        const data = JSON.parse(result.data.text);
        const quote = data.quotes.find(q => q.symbol.includes(symbol));
        if (quote) {
            if (quote.exchange === 'NSI') return 'NSE';
            if (quote.exchange === 'BSE') return 'BSE';
            return quote.exchange;
        }
        return null;
    } catch (error) {
        Logger.error("Error fetching exchange data:", error);
        return null;
    }
  },

  async searchSymbols(query) {
    if (!query) return [];
    const url = `https://symbol-search.tradingview.com/symbol_search/?text=${encodeURIComponent(query)}&hl=0&lang=en&type=stock`;
    try {
        const result = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'FETCH_PAGE', url }, resolve);
        });
        if (!result || !result.success) return [];
        const data = JSON.parse(result.data.text);
        return data.map(item => ({
            symbol: item.symbol,
            name: item.description,
            exchange: item.exchange === 'NSI' ? 'NSE' : item.exchange
        }));
    } catch (error) {
        Logger.error("Error searching symbols:", error);
        return [];
    }
  }
};
