import { Store } from '../store.js';
import { Injector } from '../injector.js';
import { UpstoxService } from '../services/upstox.js';
import { JournalSync } from '../journal-sync.js';

// Prevent TradingView's page-level keyboard shortcuts (and its symbol-search /
// text-drawing-tool hijacking) from seeing keystrokes typed/pasted into our
// Shadow DOM inputs. Every other modal in this codebase already does this;
// the Settings panel's fields were missing it.
function isolateFromPageHotkeys(el) {
  ['keydown', 'keyup', 'keypress', 'input', 'paste'].forEach(evt => el.addEventListener(evt, e => e.stopPropagation()));
}

export const SettingsComponent = {
  render(area, sidebarInstance) {
    const div = document.createElement('div');
    div.style.padding = '15px'; // Can be moved to css later if wanted
    div.innerHTML = `
            <h3>Settings</h3>
            <div style="margin-bottom:15px">
                <label><input type="checkbox" id="chk-theme" ${Store.state.settings.theme === 'dark' ? 'checked' : ''}> Dark Mode</label><br>
                <label><input type="checkbox" id="chk-wl" ${Store.state.settings.showColWatchlist ? 'checked' : ''}> Show 'WList' (Add to Watchlist) Column</label><br>
                <label><input type="checkbox" id="chk-tv" ${Store.state.settings.showColTv ? 'checked' : ''}> Show 'TrVw' (TradingView) Column</label>
                <div style="margin-top:10px; display:flex; align-items:center; gap:10px;">
                   <label for="sel-loglevel">Log Level:</label>
                   <select id="sel-loglevel" style="flex:1">
                     <option value="ERROR" ${Store.state.settings.logLevel === 'ERROR' ? 'selected' : ''}>Error</option>
                     <option value="WARN" ${Store.state.settings.logLevel === 'WARN' ? 'selected' : ''}>Warn</option>
                     <option value="INFO" ${Store.state.settings.logLevel === 'INFO' ? 'selected' : ''}>Info</option>
                     <option value="DEBUG" ${Store.state.settings.logLevel === 'DEBUG' ? 'selected' : ''}>Debug</option>
                   </select>
                </div>
            </div>
            <hr style="border:0; border-top:1px solid var(--et-border, #e0e0e0);">
            <h4>Market Data (Upstox)</h4>
            <div style="margin-bottom:15px">
                <label><input type="checkbox" id="chk-live-badges" ${Store.state.settings.showLiveBadges ? 'checked' : ''}> Show prev-day-high arrow & relative volume badges</label>
                <div style="margin-top:8px; display:flex; gap:5px;">
                  <input type="password" id="txt-upstox-token" placeholder="Upstox Access Token" value="${Store.state.settings.upstoxAccessToken || ''}" style="flex:1; padding:6px; border-radius:4px; border:1px solid var(--et-border,#e0e0e0); background:var(--et-bg,#fff); color:var(--et-fg,#333); font-size:12px;">
                  <button class="btn-primary" id="btn-save-upstox-token">Save</button>
                </div>
                <div style="display:flex; gap:5px; margin-top:6px; align-items:center;">
                  <button class="icon-btn" id="btn-test-upstox" style="border:1px solid var(--et-border,#e0e0e0); padding:4px 8px; font-size:11px;">Test Connection</button>
                  <span id="upstox-status" style="font-size:11px; color:#888;"></span>
                </div>
                <div style="font-size:11px; color:#888; margin-top:6px; line-height:1.4;">
                  Use either: a daily Access Token from your Upstox developer app (expires ~3:30am IST), or the long-lived <b>Analytics Token</b> from Apps &rarr; My Apps &rarr; Analytics tab (valid 1 year, no daily refresh needed). Do NOT use a <b>Sandbox</b> token — Sandbox only supports test order placement, not market data, so quotes will never load with it. Symbols not resolvable on Upstox simply won't show badges.
                </div>
            </div>
            <hr style="border:0; border-top:1px solid var(--et-border, #e0e0e0);">
            <h4>Trading Journal Sync</h4>
            <div style="font-size:11px; color:#888; margin-bottom:10px; line-height:1.4;">
              Sign in with the <b>same Google account</b> you use on Trading Journal. No linking code is required.
              After sign-in, the extension pushes your watchlists to your private Firebase account automatically, even when the website is closed.
            </div>
            <div style="display:flex; gap:5px; align-items:center; margin-bottom:6px;">
              <button class="btn-primary" id="btn-google-login" style="flex:1;">Sign in with Google</button>
              <button class="icon-btn" id="btn-google-logout" style="border:1px solid var(--et-border,#e0e0e0); padding:4px 8px; font-size:11px;">Sign out</button>
            </div>
            <div style="font-size:11px; color:#888; line-height:1.4;" id="journal-auth-status">Checking Google sign-in…</div>
            <div style="display:flex; gap:5px; align-items:center; margin-top:8px;">
              <button class="btn-primary" id="btn-connect-journal" style="flex:1;">Sync Now</button>
              <button class="icon-btn" id="btn-open-journal" style="border:1px solid var(--et-border,#e0e0e0); padding:4px 8px; font-size:11px;">Open Site</button>
            </div>
            <div style="font-size:11px; color:#888; margin-top:6px; line-height:1.4;" id="journal-status">
              Watchlist sync ready.
            </div>
            <hr style="border:0; border-top:1px solid var(--et-border, #e0e0e0); margin-top:15px;">
            <h4>Data Management</h4>
            <div style="display:flex; gap:5px; margin-bottom:10px;">
                <button class="btn-primary" id="btn-export-all" style="flex:1" title="Backup all data as CSV">Backup All</button>
            </div>
            <hr style="border:0; border-top:1px solid var(--et-border, #e0e0e0); margin-top:15px;">
            <h4>Watchlist Actions</h4>
            <div style="display:flex; gap:5px; margin-bottom:8px;">
                <button class="btn-primary" id="btn-clear-all" style="flex:1" title="Remove all symbols from current watchlist">Clear All Stocks</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
                <label for="sel-delete-wl" style="font-size:12px; color:#888;">Select watchlist to delete:</label>
                <select id="sel-delete-wl" style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--et-border,#e0e0e0); background:var(--et-bg,#fff); color:var(--et-fg,#333); font-size:12px;">
                  ${Store.state.watchlists.map(w => `<option value="${w.id}">${w.name} (${Store.getTotalSymbolCount(w)})</option>`).join('')}
                </select>
                <button class="btn-primary" id="btn-delete-wl" style="background:#e53935; border-color:#c62828" title="Delete the selected watchlist">Delete Selected Watchlist</button>
            </div>
        `;

    div.querySelector('#chk-theme').onchange = (e) => { Store.state.settings.theme = e.target.checked ? 'dark' : 'light'; Store.save(); Store.applyTheme(); };
    div.querySelector('#chk-wl').onchange = (e) => { Store.state.settings.showColWatchlist = e.target.checked; Store.save(); Injector.process(true); };
    div.querySelector('#chk-tv').onchange = (e) => { Store.state.settings.showColTv = e.target.checked; Store.save(); Injector.process(true); };
    div.querySelector('#sel-loglevel').onchange = (e) => { Store.state.settings.logLevel = e.target.value; Store.save(); };
    isolateFromPageHotkeys(div.querySelector('#sel-loglevel'));

    div.querySelector('#chk-live-badges').onchange = (e) => { Store.state.settings.showLiveBadges = e.target.checked; Store.save(); Injector.process(true); };
    isolateFromPageHotkeys(div.querySelector('#txt-upstox-token'));

    div.querySelector('#btn-save-upstox-token').onclick = () => {
      const token = div.querySelector('#txt-upstox-token').value;
      Store.setUpstoxToken(token);
      const status = div.querySelector('#upstox-status');
      status.textContent = 'Token saved.';
      status.style.color = '#4caf50';
    };

    div.querySelector('#btn-test-upstox').onclick = async () => {
      const status = div.querySelector('#upstox-status');
      status.textContent = 'Testing...';
      status.style.color = '#888';
      const result = await UpstoxService.testConnection();
      status.textContent = result.message;
      status.style.color = result.ok ? '#4caf50' : '#e53935';
    };

    const journalStatus = div.querySelector('#journal-status');
    const setJournalStatus = (text, color = '#888') => {
      journalStatus.textContent = text;
      journalStatus.style.color = color;
    };


    const authStatus = div.querySelector('#journal-auth-status');
    const googleLogin = div.querySelector('#btn-google-login');
    const googleLogout = div.querySelector('#btn-google-logout');

    const sendRuntime = (action) => new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action }, (response) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        if (!response) return reject(new Error('No response from extension service worker.'));
        if (!response.ok) return reject(new Error(response.error || 'Request failed.'));
        resolve(response);
      });
    });

    const refreshAuthStatus = async () => {
      try {
        const response = await sendRuntime('FIREBASE_STATUS');
        const auth = response.auth;
        if (auth?.signedIn) {
          authStatus.textContent = 'Signed in as ' + (auth.email || auth.displayName || 'Google account') + '. Automatic cloud sync is active.';
          authStatus.style.color = '#4caf50';
          googleLogin.textContent = 'Google account connected';
          googleLogin.disabled = true;
        } else {
          authStatus.textContent = 'Not signed in. Sign in with Google to enable automatic cloud sync.';
          authStatus.style.color = '#888';
          googleLogin.textContent = 'Sign in with Google';
          googleLogin.disabled = false;
        }
      } catch (e) {
        authStatus.textContent = 'Could not check Google sign-in: ' + e.message;
        authStatus.style.color = '#e53935';
      }
    };

    googleLogin.onclick = async () => {
      googleLogin.disabled = true;
      googleLogin.textContent = 'Opening Google…';
      try {
        const result = await sendRuntime('FIREBASE_SIGN_IN');
        const u = result.user || {};
        authStatus.textContent = 'Signed in as ' + (u.email || u.displayName || 'Google account') + '. Automatic cloud sync is active.';
        authStatus.style.color = '#4caf50';
        setJournalStatus('Google account connected. Syncing your watchlists…', '#4caf50');
        await JournalSync.connect();
        setJournalStatus('Google account connected and watchlists synced. Automatic sync continues every ~8 seconds.', '#4caf50');
      } catch (e) {
        authStatus.textContent = 'Google sign-in failed: ' + e.message;
        authStatus.style.color = '#e53935';
      } finally {
        await refreshAuthStatus();
      }
    };

    googleLogout.onclick = async () => {
      try {
        await sendRuntime('FIREBASE_SIGN_OUT');
        setJournalStatus('Signed out. Automatic cloud sync is paused.', '#888');
      } catch (e) {
        setJournalStatus('Sign out failed: ' + e.message, '#e53935');
      }
      await refreshAuthStatus();
    };

    div.querySelector('#btn-open-journal').onclick = async () => {
      try {
        await JournalSync.openJournal();
        setJournalStatus('Opened the journal in a new tab.', '#4caf50');
      } catch (e) {
        setJournalStatus('Could not open the journal: ' + e.message, '#e53935');
      }
    };

    const btnConnect = div.querySelector('#btn-connect-journal');
    btnConnect.onclick = async () => {
      btnConnect.disabled = true;
      btnConnect.textContent = 'Syncing…';
      setJournalStatus('Pushing your lists to the cloud…');
      try {
        const { lists, items } = await JournalSync.connect();
        setJournalStatus(
          'Synced ' + items + ' symbol(s) across ' + lists + ' list(s). Automatic sync continues every ~8 seconds even with the site closed.',
          '#4caf50'
        );
      } catch (e) {
        setJournalStatus('Sync failed: ' + e.message + '. Please sign in with Google first.', '#e53935');
      } finally {
        btnConnect.disabled = false;
        btnConnect.textContent = 'Sync Now';
      }
    };

    authStatus.dataset.ready = '1';
    refreshAuthStatus();
    div.querySelector('#btn-export-all').onclick = () => {
      let csv = "Ticker,Exchange,Color,Watchlist\n";
      Store.state.watchlists.forEach(wl => {
        wl.sections.forEach(sec => {
          sec.symbols.forEach(s => { csv += `${s.ticker},${s.exchange},${s.color || 'none'},${wl.name}\n`; });
        });
      });
      if (csv.trim() === "Ticker,Exchange,Color,Watchlist") {
        alert('Nothing to back up yet — all your watchlists are empty.');
        return;
      }
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tm_watchlist_backup.csv';
      // The anchor must be attached to the page DOM (not just the Shadow DOM
      // fragment) for a.click() to reliably trigger a download on strict-CSP
      // pages like TradingView — an unattached anchor can fail silently.
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    div.querySelector('#btn-clear-all').onclick = () => {
      const wl = Store.activeWatchlist;
      const total = Store.getTotalSymbolCount(wl);
      if (total === 0) { alert('Watchlist is already empty.'); return; }
      if (confirm(`Remove all ${total} symbols from "${wl.name}"? This cannot be undone.`)) {
        Store.clearWatchlist(wl.id);
        sidebarInstance.currentView = 'list';
        sidebarInstance.renderContent();
      }
    };

    div.querySelector('#btn-delete-wl').onclick = () => {
      const wlId = div.querySelector('#sel-delete-wl').value;
      const wl = Store.state.watchlists.find(w => w.id === wlId);
      if (!wl) return;
      if (Store.state.watchlists.length <= 1) {
        alert('Cannot delete the last watchlist.'); return;
      }
      const total = Store.getTotalSymbolCount(wl);
      if (!confirm(`Delete the watchlist "${wl.name}" (${total} symbols)? This cannot be undone.`)) return;
      if (!confirm(`Are you absolutely sure? "${wl.name}" and all its symbols will be permanently deleted.`)) return;
      Store.deleteWatchlist(wl.id);
      sidebarInstance.currentView = 'list';
      sidebarInstance.renderContent();
    };
    isolateFromPageHotkeys(div.querySelector('#sel-delete-wl'));

    area.appendChild(div);
  }
};
