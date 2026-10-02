import { SupabaseService } from './services/supabase.js';

const ACTION_TITLE = "Toggle TM Watchlist Sidebar";
const SUPPORTED_HOSTS = ["screener.in", "tradingview.com", "kite.zerodha.com"];

// Log Install
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        SupabaseService.logEvent('install'); // fire-and-forget; safe on Vivaldi
    }
});

// Set Uninstall URL — points at the user's own journal, so uninstalling
// lands somewhere that belongs to the same product.
const JOURNAL_URL = "https://tradingjournalwithtanmoy.lovable.app";
chrome.storage.sync.get(['etAnonUserId'], (syncRes) => {
    if (syncRes.etAnonUserId) {
        chrome.runtime.setUninstallURL(`${JOURNAL_URL}/?event=uninstall`);
    }
});


const SUPPORTED_SITES = [
    { name: "Screener.in", url: "https://www.screener.in/" },
    { name: "TradingView", url: "https://in.tradingview.com/" },
    { name: "Kite (Zerodha)", url: "https://kite.zerodha.com/" }
];
const UNSUPPORTED_TITLE = `TM Watchlist works on: ${SUPPORTED_SITES.map(site => site.name).join(", ")}.`;
const UNSUPPORTED_NOTICE_COOLDOWN_MS = 8000;
const unsupportedNoticeByTab = new Map();

function clearUnsupportedBadge(tabId) {
    chrome.action.setBadgeText({ tabId, text: "" });
    chrome.action.setTitle({ tabId, title: ACTION_TITLE });
}

function showUnsupportedSiteMessage(tab) {
    const tabId = tab?.id;
    if (!tabId) return;

    chrome.action.setBadgeText({ tabId, text: "!" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#d32f2f" });
    chrome.action.setTitle({ tabId, title: UNSUPPORTED_TITLE });

    const lastShownAt = unsupportedNoticeByTab.get(tabId) || 0;
    const now = Date.now();
    if (now - lastShownAt < UNSUPPORTED_NOTICE_COOLDOWN_MS) return;

    unsupportedNoticeByTab.set(tabId, now);
    chrome.tabs.create({ url: chrome.runtime.getURL("unsupported.html") });
}

async function ensureSidebarToggle(tab) {
    if (!tab?.id) return;

    const url = tab?.url || "";
    const isSupported = SUPPORTED_HOSTS.some(host => url.includes(host));

    if (!isSupported) {
        showUnsupportedSiteMessage(tab);
        return;
    }

    clearUnsupportedBadge(tab.id);

    try {
        await chrome.tabs.sendMessage(tab.id, { action: "toggle_sidebar" });
        return;
    } catch (error) {
        const message = error?.message || String(error);
        // If the content script isn't ready/injected yet, inject and retry once.
        if (message.includes("Receiving end does not exist")) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["src/bundle.js"]
                });
                // Give the loader a moment to register its listeners.
                await new Promise(resolve => setTimeout(resolve, 50));
                await chrome.tabs.sendMessage(tab.id, { action: "toggle_sidebar" });
            } catch (retryError) {
                console.warn("[TM] Failed to inject/toggle sidebar:", retryError);
            }
        } else {
            console.warn("[TM] Failed to toggle sidebar:", error);
        }
    }
}

// ── Keyboard shortcut: Ctrl+Shift+A → add current chart stock ──────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'add-stock-shortcut') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const url = tab.url || '';
  const isSupported = SUPPORTED_HOSTS.some(host => url.includes(host));
  if (!isSupported) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'add_stock_shortcut' });
  } catch (e) {
    // Content script may not be injected yet — inject then retry
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/bundle.js'] });
      await new Promise(r => setTimeout(r, 80));
      await chrome.tabs.sendMessage(tab.id, { action: 'add_stock_shortcut' });
    } catch (retryErr) {
      console.warn('[TM] add-stock-shortcut failed:', retryErr);
    }
  }
});

chrome.action.onClicked.addListener(async (tab) => {
    // Check pinned status and log only on change
    try {
        const userSettings = await chrome.action.getUserSettings();
        const currentPinned = userSettings.isOnToolbar;
        
        chrome.storage.local.get(['isPinned'], async (result) => {
            if (result.isPinned !== currentPinned) {
                SupabaseService.logEvent('ping', { pinned: currentPinned });
                chrome.storage.local.set({ isPinned: currentPinned });
            }
        });
    } catch (e) {
        console.error("Failed to check pinned status:", e);
    }

    // Fire and forget; errors are handled inside.
    ensureSidebarToggle(tab);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'FETCH_PAGE') {
        fetch(request.url)
            .then(async response => {
                const text = await response.text();
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}, body: ${text.substring(0, 200)}`);
                }
                return { text, url: response.url, status: response.status };
            })
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Will respond asynchronously
    }

    // Relay for Upstox API calls. Routed through the background service worker
    // (rather than fetched directly from the content script) so the request is
    // treated as an extension-initiated request against our host_permissions
    // and isn't blocked by the page's CORS/CSP context.
    if (request.action === 'UPSTOX_FETCH') {
        fetch(request.url, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${request.token}`
            }
        })
            .then(async response => {
                const json = await response.json().catch(() => null);
                if (!response.ok) {
                    const msg = (json && (json.errors?.[0]?.message || json.message)) || `HTTP ${response.status}`;
                    const err = new Error(msg);
                    err.status = response.status;
                    throw err;
                }
                return json;
            })
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message, status: error.status }));
        return true; // Will respond asynchronously
    }
});
