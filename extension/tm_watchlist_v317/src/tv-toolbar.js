import { Logger } from './logger.js';
import { Store } from './store.js';
import { SidebarInstance } from './sidebar.js';
import { ICONS } from './constants.js';

// Injects TM Watchlist controls directly into TradingView's own right-side
// toolbar DOM (instead of relying on the browser-toolbar extension icon).
// TradingView's DOM is not a public/stable API, so this is deliberately
// defensive: multiple fallback selectors, a debounced MutationObserver to
// survive SPA re-renders, a dedupe check before every injection, and a
// self-check that falls back to a known-safe position (end of the list)
// if the "nicer" mid-toolbar placement ever ends up invisible/clipped.

const GROUP_ATTR = 'data-eventrade-tv-group';
const GROUP_SELECTOR = `[${GROUP_ATTR}="true"]`;

// Ordered by how likely/stable each is. TradingView may rename these over
// time — add new candidates here rather than rewriting the logic below.
const TOOLBAR_SELECTORS = [
  '[data-name="right-toolbar"]',
  'div[data-name="right-toolbar"]',
];

export const TVToolbar = {
  observer: null,
  buttons: null,
  debounceTimer: null,

  init() {
    if (!window.location.hostname.includes('tradingview.com')) return;

    this.tryInject();

    if (this.observer) return; // already watching

    this.observer = new MutationObserver(() => {
      // Debounce: TradingView fires bursts of DOM mutations, so we only
      // want to re-check once the burst settles rather than on every tick.
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.tryInject(), 150);
    });

    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    document.addEventListener('et-sidebar-state-changed', () => this.syncActiveState());
  },

  findToolbar() {
    for (const selector of TOOLBAR_SELECTORS) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  },

  tryInject() {
    const toolbar = this.findToolbar();
    if (!toolbar) return;

    if (toolbar.querySelector(GROUP_SELECTOR)) {
      // Already injected into this toolbar instance — nothing to do.
      return;
    }

    const group = this.createGroup(toolbar);

    // Always append first — this is the position we've already confirmed
    // renders correctly. We then *try* to move it to a nicer spot roughly
    // in the middle of the toolbar, but only keep that move if the group
    // is still actually visible afterwards. If not, we revert to the
    // known-good appended position rather than leaving it invisible.
    toolbar.appendChild(group);

    try {
      const visibleChildren = Array.from(toolbar.children).filter(
        (el) => el !== group && el.offsetParent !== null && el.getBoundingClientRect().height > 0
      );
      if (visibleChildren.length > 1) {
        const anchor = visibleChildren[Math.floor(visibleChildren.length / 2)];
        toolbar.insertBefore(group, anchor);
        // Verify the move didn't push it somewhere invisible/clipped.
        const rect = group.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          toolbar.appendChild(group); // revert to known-good spot
        }
      }
    } catch (err) {
      Logger.warn('TM Watchlist: TV toolbar reposition failed, keeping default position: ' + err.message);
      if (!group.isConnected) toolbar.appendChild(group);
    }

    Logger.info('TM Watchlist: TV toolbar controls injected');
  },

  // Measures an existing TradingView toolbar button so ours matches its
  // size instead of a guessed pixel value that may not fit every layout.
  measureSiblingSize(toolbar) {
    const sibling = Array.from(toolbar.children).find(
      (el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0
    );
    if (!sibling) return null;
    const rect = sibling.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  },

  createGroup(toolbar) {
    const size = this.measureSiblingSize(toolbar);

    const group = document.createElement('div');
    group.className = 'et-tv-toolbar-group';
    group.setAttribute(GROUP_ATTR, 'true');

    const logoBtn = this.createButton({
      cls: 'et-tv-toolbar-btn et-tv-toolbar-btn-logo',
      attr: 'data-eventrade-tv-toggle',
      label: 'TM Watchlist',
      size: size ? { width: size.width + 8, height: size.height + 8 } : null,
    });
    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('tm48px.png');
    img.alt = '';
    img.draggable = false;
    logoBtn.appendChild(img);
    logoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      SidebarInstance.toggle();
    });

    const addBtn = this.createButton({
      cls: 'et-tv-toolbar-btn et-tv-toolbar-btn-add',
      attr: 'data-eventrade-tv-add',
      label: 'Add to Watchlist',
      size,
    });
    addBtn.innerHTML = ICONS.plus;
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      SidebarInstance.showAddStockModal();
    });

    const settingsBtn = this.createButton({
      cls: 'et-tv-toolbar-btn',
      attr: 'data-eventrade-tv-settings',
      label: 'Settings',
      size,
    });
    settingsBtn.innerHTML = ICONS.settings;
    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      SidebarInstance.openSettingsView();
    });

    group.appendChild(logoBtn);
    group.appendChild(addBtn);
    group.appendChild(settingsBtn);

    this.buttons = { logo: logoBtn, settings: settingsBtn };
    this.syncActiveState();
    return group;
  },

  createButton({ cls, attr, label, size }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = cls;
    button.setAttribute(attr, 'true');
    button.setAttribute('aria-label', label);
    button.title = label;
    if (size) {
      button.style.width = size.width + 'px';
      button.style.height = size.height + 'px';
    }
    return button;
  },

  syncActiveState() {
    let btns = this.buttons;
    if (!btns || !btns.logo || !btns.logo.isConnected) {
      btns = {
        logo: document.querySelector('[data-eventrade-tv-toggle="true"]'),
        settings: document.querySelector('[data-eventrade-tv-settings="true"]'),
      };
      this.buttons = btns;
    }

    const isOpen = Store.state.isOpen;
    const view = SidebarInstance.currentView;

    if (btns.logo) btns.logo.classList.toggle('active', isOpen);
    if (btns.settings) btns.settings.classList.toggle('active', isOpen && view === 'settings');
  },
};
