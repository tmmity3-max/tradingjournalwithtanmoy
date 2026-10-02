import { Store } from './store.js';
import { Logger } from './logger.js';
import { ICONS } from './constants.js';
import { Utils } from './utils.js';
import { Scanner } from './scanner.js';
import { Injector } from './injector.js';
import { WatchlistComponent, showWatchlistPickerModal } from './components/watchlist.js';
import { SettingsComponent } from './components/settings.js';
import { FeedbackComponent } from './components/feedback.js';
import { SupabaseService } from './services/supabase.js';
import { JournalSync } from './journal-sync.js';

export class Sidebar {
  constructor() {
    this.host = document.createElement('div');
    this.host.id = 'et-sidebar-host';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.currentView = 'list';
    this.highlightedIndex = -1;
    this.isArmed = false;
    this.debouncedNavigate = Utils.debounce(this.navigateToSymbol.bind(this), 200);
    this.isResizing = false;
    this.startX = 0;
    this.startWidth = 0;
    this.handleResize = this.handleResize.bind(this);
    this.stopResize = this.stopResize.bind(this);
  }

  async init() {
    document.documentElement.appendChild(this.host);
    this.renderStyles();
    this.render();

    // Initial state check
    if (Store.state.isOpen) this.open();

    // Message listener
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'toggle_sidebar') this.toggle();
      if (msg.action === 'add_stock_shortcut') this.handleAddStockShortcut();
    });

    this.setupKeyboardHandlers();

    // Auto-arm if previously armed (for persistent navigation)
    if (sessionStorage.getItem('et-sidebar-armed') === 'true') {
      this.arm();
    }

    // Sync highlight from URL initially and on history changes
    this.syncHighlightFromUrl();
    window.addEventListener('popstate', () => this.syncHighlightFromUrl());

    this.setupResizeHandler();
    this.unreadCount = 0;
  }

  async checkUnreadBadge(maxCacheAgeMs = 60 * 1000) {
    try {
      const gateState = await new Promise(resolve => chrome.storage.local.get(['hasOpenTickets'], resolve));
      if (!gateState.hasOpenTickets) {
          if (this.unreadCount !== 0) {
              this.unreadCount = 0;
              this.updateHeader();
          }
          return;
      }

      const cacheKey = 'etUnreadCache';
      const now = Date.now();
      
      let cache = await new Promise(resolve => chrome.storage.local.get([cacheKey], res => resolve(res[cacheKey])));
      
      if (!cache || (now - cache.timestamp > maxCacheAgeMs)) {
        // Cache missing or expired -> fetch from DB
        const userId = await SupabaseService.getUserId();
        const unreadRows = await SupabaseService.checkUnreadTickets(userId);
        
        const count = (unreadRows && unreadRows.length) ? unreadRows.length : 0;
        cache = { count, timestamp: now };
        chrome.storage.local.set({ [cacheKey]: cache });
      }

      const prevCount = this.unreadCount;
      this.unreadCount = cache.count || 0;
      
      if (prevCount !== this.unreadCount) {
         this.updateHeader(); // Re-render header immediately to show new counter
      }
    } catch (e) {
      Logger.warn("Failed checking unread badge: " + e.message);
    }
  }

  renderStyles() {
    const style = document.createElement('style');
    style.textContent = `
            :host { all: initial; font-family: -apple-system, system-ui, sans-serif; }
            * { box-sizing: border-box; }
            #sidebar {
                position: fixed; top: 0; right: 0; bottom: 0; width: ${Store.state.width}px;
                background: var(--et-bg, #ffffff); color: var(--et-fg, #333333);
                /* box-shadow removed for dock style */
                transform: translateX(100%); transition: transform 0.2s ease, width 0.1s ease; /* added width transition */
                display: flex; flex-direction: column; z-index: 2147483647; border-left: 1px solid var(--et-border, #e0e0e0);
            }
            #sidebar.open { transform: translateX(0); }
            #resize-handle {
                position: absolute; left: 0; top: 0; bottom: 0; width: 6px;
                cursor: ew-resize; z-index: 2147483648;
                background: transparent;
                transition: background 0.2s;
            }
            #resize-handle:hover { background: rgba(0,0,0,0.1); }
            header { padding: 15px; border-bottom: 1px solid var(--et-border, #e0e0e0); display: flex; justify-content: space-between; align-items: center; background: var(--et-bg, #ffffff); }
            h2 { margin: 0; font-size: 18px; font-weight: 700; }
            .icon-btn { background: transparent; border: none; cursor: pointer; color: var(--et-fg, #333333); padding: 5px; opacity: 0.7; }
            .icon-btn:hover { opacity: 1; background: var(--et-row-hover, #f5f5f5); border-radius:4px; }
            .content { flex: 1; overflow-y: auto; padding: 0; }
            
            /* Watchlist Select Header */
            .wl-select-area { padding: 10px; background: var(--et-row-hover, #f5f5f5); display: flex; gap: 5px; }
            select { flex: 1; padding: 5px; border-radius: 4px; border: 1px solid var(--et-border, #e0e0e0); background: var(--et-bg, #ffffff); color: var(--et-fg, #333333); }
            
            /* List Items */
            .wl-item { display: flex; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--et-border, #e0e0e0); gap: 8px; }
            .wl-item:hover { background: var(--et-row-hover, #f5f5f5); }
            .color-marker { width: 4px; height: 30px; background: rgba(128,128,128,0.25); cursor: pointer; border-radius: 2px; transition: background 0.15s; }
            .color-marker:hover { background: rgba(128,128,128,0.5); }
            .color-marker.red { background: var(--et-red, #f44336); }
            .color-marker.green { background: var(--et-green, #4caf50); }
            .color-marker.yellow { background: #ffc107; }
            
            .ticker-box { flex: 1; cursor: pointer; }
            .ticker { font-weight: 600; font-size: 14px; }
            .exc { font-size: 10px; color: #888; }
            
            /* Actions */
            .btn-primary { background: var(--et-accent, #2196f3); color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
            .status-msg { font-size: 11px; color: var(--et-green, #4caf50); margin-top: 5px; text-align: center; }
            textarea { width: 100%; height: 80px; margin-top: 5px; border: 1px solid var(--et-border, #e0e0e0); background: var(--et-bg, #ffffff); color: var(--et-fg, #333333); }
            
            /* Highlight (Keyboard Nav) */
            .wl-item.highlighted {
                background: var(--et-highlight-bg, rgba(33, 150, 243, 0.1));
                border-left: 3px solid var(--et-accent, #2196f3);
            }
            
            /* Disabled (Unsupported Exchange) */
            .wl-item.disabled .ticker-box { opacity: 0.5; cursor: not-allowed; text-decoration: line-through; }
            .wl-item.disabled .color-marker { opacity: 0.5; }
            
            /* Serial number */
            .et-serial { font-size: 10px; color: #aaa; min-width: 18px; text-align: right; user-select: none; }

            /* Drag-and-drop */
            .wl-item.drag-over { background: rgba(33,150,243,0.12) !important; border-top: 2px solid var(--et-accent,#2196f3); }
            .sec-header.drag-over { background: rgba(33,150,243,0.18) !important; box-shadow: inset 0 0 0 2px var(--et-accent,#2196f3); }
            .sec-empty-dropzone.drag-over { background: rgba(33,150,243,0.12) !important; box-shadow: inset 0 0 0 2px var(--et-accent,#2196f3); }

            /* Has-note badge */
            .wl-item.has-note .ticker-box { position: relative; }
            .ac-container { position: relative; flex: 1; }
            .ac-list {
                position: absolute; top: 100%; left: 0; right: 0; z-index: 1000;
                background: var(--et-bg, #ffffff); border: 1px solid var(--et-border, #e0e0e0);
                border-top: none; max-height: 200px; overflow-y: auto;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: none;
            }
            .ac-item { padding: 8px; cursor: pointer; border-bottom: 1px solid var(--et-border, #e0e0e0); display: flex; flex-direction: column; }
            .ac-item:hover, .ac-item.active { background: var(--et-row-hover, #f5f5f5); }
            .ac-item .ac-symbol { font-weight: bold; font-size: 13px; }
            .ac-item .ac-name { font-size: 11px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .ac-item .ac-exc { font-size: 10px; color: #999; margin-top: 2px; }
        `;
    this.shadow.appendChild(style);
  }

  render() {
    let container = this.shadow.getElementById('sidebar');
    if (!container) {
      container = document.createElement('div');
      container.id = 'sidebar';
      this.shadow.appendChild(container);
    }
    container.innerHTML = `
            <div id="resize-handle" title="Drag to resize"></div>
            <header id="sidebar-header"></header>
            <div class="content" id="main-content"></div>
        `;
    this.renderContent();
  }

  updateHeader() {
    const header = this.shadow.getElementById('sidebar-header');
    if (!header) return;

    if (this.currentView === 'settings' || this.currentView === 'feedback') {
      let title = this.currentView === 'settings' ? 'Settings' : 'Support';
      header.innerHTML = `
          <div style="display:flex; align-items:center; flex:1;">
              <button id="btn-back" class="icon-btn" style="display:flex; align-items:center; gap:6px; padding: 6px 10px; width:auto; font-weight:600; font-size:14px; opacity:0.9;" title="Back to Watchlist">
                  ${ICONS.arrowLeft}
                  <span>Back</span>
              </button>
          </div>
          <div style="font-size:14px; font-weight:bold; margin-right:15px; opacity:0.7;">${title}</div>
          <div style="display:flex; gap:5px;">
              <button id="btn-close" class="icon-btn" title="Close">${ICONS.close}</button>
          </div>
      `;
      const btnBack = header.querySelector('#btn-back');
      if (btnBack) {
        btnBack.onclick = () => {
          this.currentView = 'list';
          this.renderContent();
          this.notifyToolbarState();
        };
      }
    } else {
      header.innerHTML = `
          <h2>TM Watchlist</h2>
          <div style="display:flex; gap:5px; align-items:center;">
              <button id="btn-journal" class="icon-btn" title="Open Trading Journal">${ICONS.journal}</button>
              <button id="btn-settings" class="icon-btn" title="Settings">${ICONS.settings}</button>
              <button id="btn-close" class="icon-btn" title="Close">${ICONS.close}</button>
          </div>
      `;
      const btnJournal = header.querySelector('#btn-journal');
      if (btnJournal) {
        btnJournal.onclick = async () => {
          try {
            await JournalSync.openJournal();
          } catch (e) {
            Logger.warn('Could not open the journal: ' + e.message);
          }
        };
      }
      const btnSettings = header.querySelector('#btn-settings');
      if (btnSettings) {
        btnSettings.onclick = () => {
          this.currentView = 'settings';
          this.renderContent();
          this.notifyToolbarState();
        };
      }
    }

    const btnClose = header.querySelector('#btn-close');
    if (btnClose) btnClose.onclick = () => this.toggle();
  }

  renderContent() {
    this.updateHeader();
    const area = this.shadow.getElementById('main-content');
    area.innerHTML = '';
    if (this.currentView === 'settings') {
      SettingsComponent.render(area, this);
    } else if (this.currentView === 'feedback') {
      FeedbackComponent.render(area, this);
    } else {
      WatchlistComponent.render(area, this);
    }
  }

  setupKeyboardHandlers() {
    // Global keydown for sidebar shortcuts
    document.addEventListener('keydown', this.handleKeydown.bind(this));

    // Arming logic
    this.host.addEventListener('mousedown', () => this.arm());
    this.host.addEventListener('focusin', () => this.arm());

    // Disarm logic (clicking outside)
    document.addEventListener('mousedown', (e) => {
      if (!this.host.contains(e.target)) {
        this.disarm();
      }
    });
  }

  arm() {
    this.isArmed = true;
    sessionStorage.setItem('et-sidebar-armed', 'true');
    // visual feedback if needed
  }

  disarm() {
    this.isArmed = false;
    sessionStorage.removeItem('et-sidebar-armed');
    // remove visual feedback if needed
  }

  handleKeydown(e) {
    if (!Store.state.isOpen || !this.isArmed || this.currentView !== 'list') return;

    // Safety check: not typing in inputs
    // Check main document active element
    let activeTag = document.activeElement.tagName.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select' || document.activeElement.isContentEditable) return;

    // Check shadow DOM active element (if focused element is the host)
    if (this.host === document.activeElement && this.shadow.activeElement) {
      activeTag = this.shadow.activeElement.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select' || this.shadow.activeElement.isContentEditable) return;
    }

    // Navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.moveHighlight(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.moveHighlight(1);
    }
    // Cross-site shortcuts
    else if (e.key.toUpperCase() === 'T' && window.location.hostname.includes('screener.in')) {
      e.preventDefault();
      this.openCrossSite(true); // Open TV
    } else if (e.key.toUpperCase() === 'S' && window.location.hostname.includes('tradingview.com')) {
      e.preventDefault();
      this.openCrossSite(false); // Open Screener
    }
  }

  moveHighlight(delta) {
    const symbols = Store.activeWatchlist.symbols;
    if (!symbols.length) return;

    let newIndex = this.highlightedIndex + delta;

    // Boundary checks with no wrap
    if (newIndex < 0) newIndex = 0; // Stop at top
    else if (newIndex >= symbols.length) newIndex = symbols.length - 1; // Stop at bottom

    // Special case: if starting from -1
    if (this.highlightedIndex === -1) {
      newIndex = delta > 0 ? 0 : symbols.length - 1;
    }

    if (newIndex !== this.highlightedIndex) {
      this.highlightedIndex = newIndex;
      this.updateHighlightVisuals();
      this.debouncedNavigate();
    }
  }

  updateHighlightVisuals() {
    const container = this.shadow.getElementById('wl-list-container');
    if (!container) return;

    const rows = container.querySelectorAll('.wl-item');
    rows.forEach((row, idx) => {
      if (idx === this.highlightedIndex) {
        row.classList.add('highlighted');
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        row.classList.remove('highlighted');
      }
    });
  }

  async navigateToSymbol() {
    const symbolItem = Store.activeWatchlist.symbols[this.highlightedIndex];
    if (!symbolItem) return;

    let ticker = symbolItem.ticker;
    let exchange = symbolItem.exchange;

    // Resolve BSE if numeric
    if (exchange === 'BSE' && /^\d+$/.test(ticker)) {
      const resolved = await Utils.resolveSymbol(ticker);
      ticker = resolved.ticker;
      // Keep exchange as BSE
    }

    const isTv = window.location.hostname.includes('tradingview.com');
    if (isTv) {
      // TradingView: Try soft navigation first
      const fullSymbol = `${exchange}:${ticker}`;
      const success = await this.setTradingViewSymbol(fullSymbol);

      this.arm(); // Ensure we stay armed

      if (!success) {
        // Fallback to reload if UI automation fails
        Logger.warn("[TM] Soft nav failed, falling back to reload");
        window.location.href = `https://in.tradingview.com/chart/?symbol=${fullSymbol}`;
      } else {
        Logger.debug("Soft nav dispatched");
      }
    } else {
      // Screener: Navigate in current tab
      this.arm(); // Ensure we stay armed after reload
      // For screener, we can usually use the numeric ticker or the original one
      // But let's use the item's original ticker for consistency with how Screener works
      window.location.href = `https://www.screener.in/company/${symbolItem.ticker}/`;
    }
  }

  /**
   * handleAddStockShortcut – triggered by Ctrl+Shift+A.
   * 1. Opens sidebar if closed.
   * 2. Switches to watchlist (list) view.
   * 3. Reads the ticker from the current page.
   * 4. Pre-fills the add-input and fires autocomplete so results appear instantly.
   */
  async handleAddStockShortcut() {
    // 1. Ensure sidebar is open
    if (!Store.state.isOpen) this.open();

    // 2. Switch to list view
    if (this.currentView !== 'list') {
      this.currentView = 'list';
      this.renderContent();
    }

    await this.showAddStockModal();
  }

  /**
   * showAddStockModal – shows just the "Add / Move Stock" picker for the
   * current chart symbol, without opening/switching the full sidebar panel.
   * Used by the TradingView toolbar's quick "+" button.
   */
  async showAddStockModal() {
    // 3. Read ticker (and, on TradingView, exchange) from the page
    let rawTicker = Utils.getSymbolFromPage();
    let exchangeFromChart = null;

    if (window.location.hostname.includes('tradingview.com')) {
      const fullSymbol = await Utils.getCurrentTvSymbolFromApi(); // e.g. "NSE:GODREJPROP"
      if (fullSymbol && fullSymbol.includes(':')) {
        const [exch, tick] = fullSymbol.split(':');
        exchangeFromChart = exch === 'NSI' ? 'NSE' : exch;
        rawTicker = tick || rawTicker; // trust the chart's own ticker too, it's authoritative
      }
    }

    if (!rawTicker) {
      // No ticker on page and no manual search box anymore — nothing to pre-fill.
      return;
    }

    const ticker   = rawTicker.toUpperCase().trim();
    const exchange = exchangeFromChart || await Utils.getStockExchange(ticker) || 'NSE';

    // 4. Show watchlist picker modal with all watchlists as checkboxes
    const tryModal = () => {
      // sidebar must be rendered before we can attach to shadow
      showWatchlistPickerModal(
        this.shadow,
        ticker,
        exchange,
        (changed) => { if (changed) this.renderContent(); }
      );
    };
    setTimeout(tryModal, 80);
  }

  async setTradingViewSymbol(symbol) {
    // Soft Navigation via Injection Bridge
    // We cannot access TradingViewApi directly from the content script (Sidebar).
    // Instead, we dispatch a custom event that the injected script (tv-inject.js) listens to.
    Logger.debug(`Attempting soft nav via Injection to: ${symbol}`);

    let exchange = 'NSE';
    let ticker = symbol;

    if (symbol.includes(':')) {
      [exchange, ticker] = symbol.split(':');
    }

    document.dispatchEvent(new CustomEvent("change_tradingview_symbol", {
      detail: {
        symbol: ticker,
        exchange: exchange
      }
    }));

    return true;
  }

  waitForEl(selector, timeout) {
    return new Promise(resolve => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
    });
  }

  openCrossSite(toTv) {
    const symbol = Store.activeWatchlist.symbols[this.highlightedIndex];
    if (!symbol) return;

    let url;
    if (toTv) {
      url = `https://in.tradingview.com/chart/?symbol=${symbol.exchange}:${symbol.ticker}`;
    } else {
      url = `https://www.screener.in/company/${symbol.ticker}/`;
    }
    window.open(url, '_blank');
  }



  syncHighlightFromUrl() {
    const isTv = window.location.hostname.includes('tradingview.com');
    let ticker = null;
    let exchange = null;

    if (isTv) {
      // url param: symbol=NSE:TATA or present in title? 
      // safer to check URL params
      const params = new URLSearchParams(window.location.search);
      const symParam = params.get('symbol'); // e.g. NSE:TATA
      if (symParam) {
        const parts = symParam.split(':');
        if (parts.length === 2) {
          exchange = parts[0];
          ticker = parts[1];
        } else {
          ticker = symParam;
        }
      }
    } else {
      // Screener: /company/TATA/
      ticker = Utils.extractTickerFromUrl(window.location.href);
    }

    if (ticker) {
      const idx = Store.activeWatchlist.symbols.findIndex(s => s.ticker === ticker);
      if (idx !== -1) {
        this.highlightedIndex = idx;
        this.updateHighlightVisuals();
      }
    }
  }

  toggle() {
    Store.state.isOpen = !Store.state.isOpen;
    Store.save();
    Store.state.isOpen ? this.open() : this.close();
    this.notifyToolbarState();
  }

  /** Opens the sidebar (if closed) and switches straight to the watchlist/list view. */
  openWatchlistView() {
    if (!Store.state.isOpen) { Store.state.isOpen = true; Store.save(); this.open(); }
    if (this.currentView !== 'list') {
      this.currentView = 'list';
      this.renderContent();
    }
    this.notifyToolbarState();
  }

  /** Opens the sidebar (if closed) and switches straight to the settings view. */
  openSettingsView() {
    if (!Store.state.isOpen) { Store.state.isOpen = true; Store.save(); this.open(); }
    if (this.currentView !== 'settings') {
      this.currentView = 'settings';
      this.renderContent();
    }
    this.notifyToolbarState();
  }

  notifyToolbarState() {
    document.dispatchEvent(new CustomEvent('et-sidebar-state-changed', {
      detail: { isOpen: Store.state.isOpen, view: this.currentView }
    }));
  }

  open() {
    this.shadow.getElementById('sidebar').classList.add('open');
    this.updatePageLayout(Store.state.width);
    try {
        SupabaseService.logEvent('open_sidebar');
    } catch (e) {
        Logger.warn("Failed to log open_sidebar event: " + e.message);
    }
  }

  close() {
    this.shadow.getElementById('sidebar').classList.remove('open');
    this.updatePageLayout(0);
  }

  updatePageLayout(width) {
    const isTv = window.location.hostname.includes('tradingview.com');
    if (isTv) {
      // TradingView: Resize body width to force layout recalculation
      // We use 100vw - width because TV uses fixed positioning relative to viewport often
      // We also use transform: translateZ(0) to force body to be the containing block for fixed elements (like the layout sensor)
      if (width > 0) {
        document.body.style.width = `calc(100vw - ${width}px)`;
        document.body.style.transform = 'translateZ(0)';
        // Trigger resize to ensure TV re-calculates immediately
        window.dispatchEvent(new Event('resize'));
      } else {
        document.body.style.width = '';
        document.body.style.transform = '';
        window.dispatchEvent(new Event('resize'));
      }
    } else {
      // Screener.in: Margin Right works fine
      document.body.style.marginRight = width > 0 ? `${width}px` : '0';
      document.body.style.width = ''; // Reset width
    }
  }

  setupResizeHandler() {
    const handle = this.shadow.getElementById('resize-handle');
    if (!handle) return;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault(); // update: prevent text selection
      this.isResizing = true;
      this.startX = e.clientX;
      this.startWidth = Store.state.width;

      const sidebar = this.shadow.getElementById('sidebar');
      if (sidebar) sidebar.style.transition = 'none'; // disable transition for smooth drag

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';

      window.addEventListener('mousemove', this.handleResize);
      window.addEventListener('mouseup', this.stopResize);
    });
  }

  handleResize(e) {
    if (!this.isResizing) return;
    const delta = this.startX - e.clientX; // Move left = positive delta = increase width
    let newWidth = this.startWidth + delta;

    // Constraints
    if (newWidth < 250) newWidth = 250;
    if (newWidth > 800) newWidth = 800;

    const sidebar = this.shadow.getElementById('sidebar');
    if (sidebar) sidebar.style.width = `${newWidth}px`;

    // Only update layout if open
    if (Store.state.isOpen) {
      this.updatePageLayout(newWidth);
    }
  }

  stopResize() {
    this.isResizing = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    window.removeEventListener('mousemove', this.handleResize);
    window.removeEventListener('mouseup', this.stopResize);

    const sidebar = this.shadow.getElementById('sidebar');
    if (sidebar) {
      sidebar.style.transition = 'transform 0.2s ease, width 0.1s ease'; // restore
      Store.state.width = parseInt(sidebar.style.width, 10);
      Store.save();
    }
  }
}

export const SidebarInstance = new Sidebar();
