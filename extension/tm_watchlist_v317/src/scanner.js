import { Utils } from './utils.js';
import { Store } from './store.js';
import { Logger } from './logger.js';

export const Scanner = {
  isScanning: false,

  async fetchUrl(url) {
    const res = await fetch(url);
    const text = await res.text();
    const parser = new DOMParser();
    return parser.parseFromString(text, 'text/html');
  },

  getTotalPages(doc) {
    if (!window.location.hostname.includes('screener.in')) return 1;
    
    // Strategy 1: data-page-info (Exact)
    const info = doc.querySelector("div[data-page-info]");
    if (info) {
      const match = info.innerText.match(/of\s+(\d+)/i);
      if (match) return parseInt(match[1], 10);
    }

    // Strategy 2: Pagination links (Fallback)
    const pagination = doc.querySelectorAll("div.pagination a");
    if (pagination.length > 0) {
       const nums = Array.from(pagination)
         .map(a => parseInt(a.innerText))
         .filter(n => !isNaN(n));
       if (nums.length > 0) return Math.max(...nums);
    }
    
    return 1;
  },



  async scanPage(doc) {
    const isZerodha = window.location.hostname.includes('zerodha.com');
    Logger.info(`[Scanner] isZerodha: ${isZerodha}, URL: ${window.location.href}`);
    const symbols = [];
    
    if (isZerodha) {
      // Selector fixed: .holdings-table is likely on a div wrapper, not the table itself
      const rows = doc.querySelectorAll(".holdings-table table tbody tr");
      Logger.info(`[Scanner] Zerodha rows found: ${rows.length}`);
      
      for (const row of rows) {
         const span = row.querySelector("td.instrument span");
         if (span) {
             const ticker = span.innerText.trim();
             Logger.debug(`[Scanner] Found ticker: ${ticker}`);
             const exchange = await Utils.getStockExchange(ticker) || 'NSE';
             Logger.debug(`[Scanner] Resolved ${ticker} to ${exchange}`);
             symbols.push({ ticker, exchange });
         } else {
             Logger.debug(`[Scanner] No instrument span found in row`, row);
         }
      }
    } else {
      // Screener.in Logic
      const rows = doc.querySelectorAll("table.data-table tbody tr");
      rows.forEach(row => {
        const link = row.querySelector("a[href*='/company/']");
        if (link) {
          const ticker = Utils.extractTickerFromUrl(link.getAttribute("href"));
          if (ticker) symbols.push({ ticker, exchange: /^\d+$/.test(ticker) ? "BSE" : "NSE" });
        }
      });
    }
    return symbols;
  },

  async scanAllPages(onProgress) {
    this.isScanning = true;
    let url = window.location.href;
    let accumulatedSymbols = [];
    let page = 1;

    try {
      while (url && this.isScanning && page <= 50) {
        if (onProgress) onProgress(`Scanning Page ${page}...`);
        
        const doc = await this.fetchUrl(url);
        // Note: scanPage is now async because of API calls for Zerodha
        const symbols = await this.scanPage(doc); 
        
        // Accumulate symbols to maintain Page 1 -> Page N order
        accumulatedSymbols.push(...symbols);

        // Find next link (Screener only)
        const nextLink = doc.querySelector("div.pagination a[rel='next']") ||
          Array.from(doc.querySelectorAll("a")).find(a => a.innerText.includes("Next"));

        url = nextLink ? nextLink.href : null;
        page++;
        
        await new Promise(r => setTimeout(r, 500)); // Rate limit
      }
    } catch (e) {
      Logger.error("Scanning failed:", e);
    }

    this.isScanning = false;
    
    // Batch add to preserve order [P1...PN]
    const addedCount = Store.addSymbols(accumulatedSymbols);
    return addedCount;
  }
};
