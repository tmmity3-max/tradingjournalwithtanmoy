import { Store } from '../store.js';
import { ICONS } from '../constants.js';
import { Utils } from '../utils.js';
import { Scanner } from '../scanner.js';
import { SupabaseService } from '../services/supabase.js';
import { UpstoxService } from '../services/upstox.js';

// Prev-day-high crossover arrows + relative-volume badge helpers
const UP_ARROW_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="#2196f3"><path d="M12 4l8 12H4z"/></svg>`;
const DOWN_ARROW_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="#e53935"><path d="M12 20L4 8h16z"/></svg>`;

function rvolColor(r) {
  if (r >= 3) return '#e53935';
  if (r >= 1.5) return '#fb8c00';
  if (r >= 1) return '#43a047';
  return '#757575';
}

function applyIndicatorsToRow(row, indicators) {
  const arrowEl = row.querySelector('.mkt-arrow');
  const rvolEl = row.querySelector('.mkt-rvol');
  if (arrowEl) {
    arrowEl.innerHTML = indicators.crossed === true ? UP_ARROW_SVG : indicators.crossed === false ? DOWN_ARROW_SVG : '';
    arrowEl.title = indicators.crossed === true ? 'LTP has crossed above previous day\'s high'
      : indicators.crossed === false ? 'LTP is still below previous day\'s high' : '';
  }
  if (rvolEl) {
    if (indicators.rvol != null) {
      rvolEl.textContent = indicators.rvol.toFixed(1) + 'x';
      rvolEl.style.background = rvolColor(indicators.rvol);
      rvolEl.style.display = 'inline-block';
      rvolEl.title = `Relative volume: ${indicators.rvol.toFixed(2)}x the 10-day average`;
    } else {
      rvolEl.style.display = 'none';
    }
  }
}

// ─────────────────────────────────────────────────────────────────
//  NOTES MODAL
// ─────────────────────────────────────────────────────────────────
export function showNotesModal(shadow, ticker, exchange, currentNote, onSave) {
  const old = shadow.getElementById('et-notes-modal');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'et-notes-modal';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.5);
    display:flex; align-items:center; justify-content:center;
    z-index:2147483649; font-family:-apple-system,system-ui,sans-serif;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background:var(--et-bg,#fff); color:var(--et-fg,#1a1a1a);
    border-radius:12px; padding:20px; width:320px; max-width:95vw;
    box-shadow:0 8px 32px rgba(0,0,0,0.25);
    border:1px solid var(--et-border,#e0e0e0);
    display:flex; flex-direction:column; gap:12px;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-weight:700; font-size:15px;';
  titleEl.textContent = `Note: ${ticker}`;
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = ICONS.close;
  closeBtn.style.cssText = 'background:none; border:none; cursor:pointer; color:var(--et-fg,#333); padding:2px;';
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:12px; color:#888;';
  sub.textContent = `${exchange} — Add notes, trade plans, or reminders`;

  const textarea = document.createElement('textarea');
  textarea.value = currentNote || '';
  textarea.placeholder = 'e.g. Minervini stage 2 breakout, Q4 results due Apr 28';
  textarea.style.cssText = `
    width:100%; height:100px; padding:10px; border-radius:8px; resize:vertical;
    border:1px solid var(--et-border,#e0e0e0);
    background:var(--et-bg,#fff); color:var(--et-fg,#1a1a1a);
    font-size:13px; line-height:1.5; outline:none;
    font-family:-apple-system,system-ui,sans-serif;
  `;

  overlay.addEventListener('mousedown', e => { if (e.target === overlay) e.preventDefault(); });
  ['keydown', 'keyup', 'keypress', 'paste', 'input'].forEach(evt => textarea.addEventListener(evt, e => e.stopPropagation()));
  setTimeout(() => { textarea.focus(); }, 0);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    padding:7px 16px; border-radius:6px; border:1px solid var(--et-border,#ddd);
    background:transparent; color:var(--et-fg,#333); cursor:pointer; font-size:13px;
  `;
  cancelBtn.onclick = () => overlay.remove();

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save Note';
  saveBtn.style.cssText = `
    padding:7px 16px; border-radius:6px; border:none;
    background:var(--et-accent,#2196f3); color:#fff; cursor:pointer;
    font-size:13px; font-weight:600;
  `;
  saveBtn.onclick = () => {
    if (onSave) onSave(textarea.value.trim());
    overlay.remove();
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);
  card.appendChild(header);
  card.appendChild(sub);
  card.appendChild(textarea);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  shadow.appendChild(overlay);
  setTimeout(() => textarea.focus(), 50);
}

// ─────────────────────────────────────────────────────────────────
//  MOVE TO WATCHLIST MODAL  (cross-watchlist + cross-section)
// ─────────────────────────────────────────────────────────────────
export function showMoveToWatchlistModal(shadow, ticker, exchange, onMoved) {
  const old = shadow.getElementById('et-move-modal');
  if (old) old.remove();

  // Find which watchlist+section currently holds this stock
  let currentWlId = null, currentSecId = null;
  for (const wl of Store.state.watchlists) {
    for (const sec of wl.sections) {
      if (sec.symbols.some(s => s.ticker === ticker && s.exchange === exchange)) {
        currentWlId = wl.id;
        currentSecId = sec.id;
        break;
      }
    }
    if (currentWlId) break;
  }

  const overlay = document.createElement('div');
  overlay.id = 'et-move-modal';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.5);
    display:flex; align-items:center; justify-content:center;
    z-index:2147483649; font-family:-apple-system,system-ui,sans-serif;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background:var(--et-bg,#fff); color:var(--et-fg,#1a1a1a);
    border-radius:12px; padding:20px; min-width:280px; max-width:340px;
    box-shadow:0 8px 32px rgba(0,0,0,0.25);
    border:1px solid var(--et-border,#e0e0e0);
    display:flex; flex-direction:column; gap:14px;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-weight:700; font-size:15px;';
  titleEl.textContent = `Move ${ticker}`;
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = ICONS.close;
  closeBtn.style.cssText = 'background:none; border:none; cursor:pointer; color:var(--et-fg,#333); padding:2px;';
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:12px; color:#888;';
  sub.textContent = `${exchange} — choose destination`;

  // Watchlist selector
  const wlRow = document.createElement('div');
  wlRow.style.cssText = 'display:flex; flex-direction:column; gap:5px;';
  const wlLabel = document.createElement('div');
  wlLabel.style.cssText = 'font-size:11px; color:#888; text-transform:uppercase; letter-spacing:0.5px; font-weight:600;';
  wlLabel.textContent = 'Watchlist';
  const wlSelect = document.createElement('select');
  wlSelect.style.cssText = `
    width:100%; padding:7px 8px; border-radius:7px;
    border:1px solid var(--et-border,#e0e0e0);
    background:var(--et-bg,#fff); color:var(--et-fg,#1a1a1a);
    font-size:13px; font-family:inherit; outline:none;
  `;
  wlRow.appendChild(wlLabel);
  wlRow.appendChild(wlSelect);

  // Section selector
  const secRow = document.createElement('div');
  secRow.style.cssText = 'display:flex; flex-direction:column; gap:5px;';
  const secLabel = document.createElement('div');
  secLabel.style.cssText = 'font-size:11px; color:#888; text-transform:uppercase; letter-spacing:0.5px; font-weight:600;';
  secLabel.textContent = 'Section';
  const secSelect = document.createElement('select');
  secSelect.style.cssText = `
    width:100%; padding:7px 8px; border-radius:7px;
    border:1px solid var(--et-border,#e0e0e0);
    background:var(--et-bg,#fff); color:var(--et-fg,#1a1a1a);
    font-size:13px; font-family:inherit; outline:none;
  `;
  secRow.appendChild(secLabel);
  secRow.appendChild(secSelect);

  // Fill watchlist dropdown
  Store.state.watchlists.forEach(wl => {
    const opt = document.createElement('option');
    opt.value = wl.id;
    opt.textContent = `${wl.name} (${Store.getTotalSymbolCount(wl)})`;
    if (wl.id === currentWlId) opt.selected = true;
    wlSelect.appendChild(opt);
  });

  // Populate sections for a given watchlist
  function populateSections(wlId, preselect) {
    secSelect.innerHTML = '';
    const wl = Store.state.watchlists.find(w => w.id === wlId);
    if (!wl) return;
    wl.sections.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec.id;
      opt.textContent = `${sec.name} (${sec.symbols.length})`;
      if (sec.id === preselect || (!preselect && sec.name === 'Main')) opt.selected = true;
      secSelect.appendChild(opt);
    });
  }
  populateSections(wlSelect.value, currentSecId);

  // Block TradingView's focus-stealing handler
  overlay.addEventListener('mousedown', e => e.preventDefault());
  wlSelect.addEventListener('mousedown', e => e.stopPropagation());
  secSelect.addEventListener('mousedown', e => e.stopPropagation());
  ['keydown', 'keyup', 'keypress', 'paste'].forEach(evt => {
    wlSelect.addEventListener(evt, e => e.stopPropagation());
    secSelect.addEventListener(evt, e => e.stopPropagation());
  });
  wlSelect.addEventListener('change', () => populateSections(wlSelect.value, null));

  // Button row
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; margin-top:4px;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    padding:8px 16px; border-radius:6px; border:1px solid var(--et-border,#ddd);
    background:transparent; color:var(--et-fg,#333); cursor:pointer; font-size:13px;
  `;
  cancelBtn.onclick = () => overlay.remove();

  const moveBtn = document.createElement('button');
  moveBtn.textContent = 'Move Here';
  moveBtn.style.cssText = `
    padding:8px 18px; border-radius:6px; border:none;
    background:var(--et-accent,#2196f3); color:#fff; cursor:pointer;
    font-size:13px; font-weight:600;
  `;
  moveBtn.onclick = () => {
    const targetWlId = wlSelect.value;
    const targetSecId = secSelect.value;
    Store.moveSymbolAcrossWatchlists(targetWlId, targetSecId, ticker, exchange);
    overlay.remove();
    if (onMoved) onMoved();
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(moveBtn);

  card.appendChild(header);
  card.appendChild(sub);
  card.appendChild(wlRow);
  card.appendChild(secRow);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  shadow.appendChild(overlay);
  setTimeout(() => wlSelect.focus(), 0);
}

// ─────────────────────────────────────────────────────────────────
//  RENAME MODAL (generic)
// ─────────────────────────────────────────────────────────────────
function showTextInputModal(shadow, title, currentValue, placeholder, onSave) {
  const old = shadow.getElementById('et-input-modal');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'et-input-modal';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.5);
    display:flex; align-items:center; justify-content:center;
    z-index:2147483649; font-family:-apple-system,system-ui,sans-serif;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background:var(--et-bg,#fff); color:var(--et-fg,#1a1a1a);
    border-radius:12px; padding:20px; width:280px; max-width:95vw;
    box-shadow:0 8px 32px rgba(0,0,0,0.25);
    border:1px solid var(--et-border,#e0e0e0);
    display:flex; flex-direction:column; gap:12px;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-weight:700; font-size:15px;';
  titleEl.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = ICONS.close;
  closeBtn.style.cssText = 'background:none; border:none; cursor:pointer; color:var(--et-fg,#333); padding:2px;';
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentValue || '';
  input.placeholder = placeholder;
  input.style.cssText = `
    width:100%; padding:8px 10px; border-radius:8px;
    border:1px solid var(--et-border,#e0e0e0);
    background:var(--et-bg,#fff); color:var(--et-fg,#1a1a1a);
    font-size:13px; outline:none; box-sizing:border-box;
    font-family:-apple-system,system-ui,sans-serif;
  `;

  // Block clicks on the dark backdrop from stealing focus back to the
  // TradingView page underneath — scoped to the backdrop only (not the
  // input itself, which would otherwise block the browser's default
  // click-to-focus behavior and break re-focusing/typing/pasting).
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) e.preventDefault(); });
  ['keydown', 'keyup', 'keypress', 'paste', 'input'].forEach(evt => input.addEventListener(evt, e => e.stopPropagation()));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });
  // Focus after event loop clears (prevents TradingView search box from stealing focus)
  setTimeout(() => { input.focus(); input.select(); }, 0);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    padding:7px 16px; border-radius:6px; border:1px solid var(--et-border,#ddd);
    background:transparent; color:var(--et-fg,#333); cursor:pointer; font-size:13px;
  `;
  cancelBtn.onclick = () => overlay.remove();

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = `
    padding:7px 16px; border-radius:6px; border:none;
    background:var(--et-accent,#2196f3); color:#fff; cursor:pointer;
    font-size:13px; font-weight:600;
  `;
  saveBtn.onclick = () => {
    const val = input.value.trim();
    if (val) { if (onSave) onSave(val); }
    overlay.remove();
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);
  card.appendChild(header);
  card.appendChild(input);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  shadow.appendChild(overlay);
  setTimeout(() => { textarea.focus(); }, 0);
}

// ─────────────────────────────────────────────────────────────────
//  WATCHLIST PICKER MODAL (add stock to multiple watchlists)
// ─────────────────────────────────────────────────────────────────
export function showWatchlistPickerModal(shadow, ticker, exchange, onDone) {
  const old = shadow.getElementById('et-wl-picker');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'et-wl-picker';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.45);
    display:flex; align-items:center; justify-content:center;
    z-index:2147483649; font-family:-apple-system,system-ui,sans-serif;
  `;

  const currentMembership = new Set(
    Store.state.watchlists
      .filter(wl => wl.sections.some(s => s.symbols.some(sym => sym.ticker === ticker && sym.exchange === exchange)))
      .map(wl => wl.id)
  );
  const uiState = new Map(
    Store.state.watchlists.map(wl => [wl.id, currentMembership.has(wl.id)])
  );

  const card = document.createElement('div');
  card.style.cssText = `
    background:var(--et-bg,#fff); color:var(--et-fg,#1a1a1a);
    border-radius:12px; padding:20px; min-width:260px; max-width:320px;
    box-shadow:0 8px 32px rgba(0,0,0,0.22);
    border:1px solid var(--et-border,#e0e0e0);
  `;

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700; font-size:15px; margin-bottom:4px;';
  title.textContent = 'Add / Move Stock';

  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:12px; color:#888; margin-bottom:14px;';
  sub.textContent = `${exchange}:${ticker} — tick to add, untick to remove`;

  card.appendChild(title);
  card.appendChild(sub);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin-bottom:16px;';

  Store.state.watchlists.forEach(wl => {
    const total = Store.getTotalSymbolCount(wl);
    const row = document.createElement('label');
    row.style.cssText = `
      display:flex; align-items:center; gap:10px; cursor:pointer;
      padding:8px 10px; border-radius:8px; border:1px solid var(--et-border,#e0e0e0);
      background:var(--et-row-hover,#f5f5f5); font-size:13px;
      transition:background 0.15s;
    `;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = uiState.get(wl.id);
    cb.style.cssText = 'width:16px; height:16px; cursor:pointer; accent-color:var(--et-accent,#2196f3);';
    cb.addEventListener('change', () => uiState.set(wl.id, cb.checked));

    const nameSpan = document.createElement('span');
    nameSpan.textContent = wl.name;
    if (wl.id === Store.state.activeWatchlistId) nameSpan.style.fontWeight = '600';

    const badge = document.createElement('span');
    badge.style.cssText = 'margin-left:auto; font-size:11px; color:#aaa;';
    badge.textContent = `${total} stocks`;

    row.appendChild(cb);
    row.appendChild(nameSpan);
    row.appendChild(badge);
    list.appendChild(row);
  });

  card.appendChild(list);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    padding:7px 16px; border-radius:6px; border:1px solid var(--et-border,#ddd);
    background:transparent; color:var(--et-fg,#333); cursor:pointer; font-size:13px;
  `;
  cancelBtn.onclick = () => overlay.remove();

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = `
    padding:7px 16px; border-radius:6px; border:none;
    background:var(--et-accent,#2196f3); color:#fff; cursor:pointer;
    font-size:13px; font-weight:600;
  `;
  saveBtn.onclick = () => {
    let changed = false;
    uiState.forEach((shouldHave, watchlistId) => {
      const hadBefore = currentMembership.has(watchlistId);
      if (shouldHave && !hadBefore) { Store.addSymbolToWatchlist(watchlistId, ticker, exchange); changed = true; }
      else if (!shouldHave && hadBefore) {
        // Find which section has it and remove
        const wl = Store.state.watchlists.find(w => w.id === watchlistId);
        if (wl) {
          for (const sec of wl.sections) {
            const before = sec.symbols.length;
            sec.symbols = sec.symbols.filter(s => !(s.ticker === ticker && s.exchange === exchange));
            if (sec.symbols.length < before) { Store.save(); changed = true; break; }
          }
        }
      }
    });
    overlay.remove();
    if (onDone) onDone(changed);
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  shadow.appendChild(overlay);
  setTimeout(() => saveBtn.focus(), 50);
}

// ─────────────────────────────────────────────────────────────────
//  PASTE IMPORT MODAL
// ─────────────────────────────────────────────────────────────────
export function showPasteImportModal(shadow, sidebarInstance) {
  const old = shadow.getElementById('et-paste-modal');
  if (old) old.remove();

  const wl = Store.activeWatchlist;
  const activeSec = Store.getActiveSection(wl);

  const overlay = document.createElement('div');
  overlay.id = 'et-paste-modal';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.5);
    display:flex; align-items:center; justify-content:center;
    z-index:2147483649; font-family:-apple-system,system-ui,sans-serif;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background:var(--et-bg,#fff); color:var(--et-fg,#1a1a1a);
    border-radius:12px; padding:20px; width:340px; max-width:95vw;
    box-shadow:0 8px 32px rgba(0,0,0,0.25);
    border:1px solid var(--et-border,#e0e0e0);
    display:flex; flex-direction:column; gap:12px;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-weight:700; font-size:15px;';
  titleEl.textContent = 'Paste Stock List';
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = ICONS.close;
  closeBtn.style.cssText = 'background:none; border:none; cursor:pointer; color:var(--et-fg,#333); padding:2px;';
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  // Section selector
  const secLabel = document.createElement('div');
  secLabel.style.cssText = 'font-size:12px; color:#888;';
  secLabel.textContent = 'Import into:';

  const secSelect = document.createElement('select');
  secSelect.style.cssText = `
    width:100%; padding:6px 8px; border-radius:6px;
    border:1px solid var(--et-border,#e0e0e0);
    background:var(--et-bg,#fff); color:var(--et-fg,#1a1a1a);
    font-size:13px; font-family:inherit;
  `;
  wl.sections.forEach(sec => {
    const opt = document.createElement('option');
    opt.value = sec.id;
    opt.textContent = sec.name;
    if (activeSec && sec.id === activeSec.id) opt.selected = true;
    if (!activeSec && sec.name === 'Main') opt.selected = true;
    secSelect.appendChild(opt);
  });
  secSelect.addEventListener('mousedown', e => e.stopPropagation());
  ['keydown', 'keyup', 'keypress', 'paste'].forEach(evt => secSelect.addEventListener(evt, e => e.stopPropagation()));
  secSelect.addEventListener('change', () => textarea.focus());

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:11px; color:#888; line-height:1.5;';
  hint.textContent = 'Paste tickers from Chartink, WhatsApp, or any source. Comma, space, or newline separated.';

  const textarea = document.createElement('textarea');
  textarea.placeholder = 'RUBICON, EBGNG, BLUEJET\nWOCKPHARMA, POLYMED';
  textarea.style.cssText = `
    width:100%; height:100px; padding:10px; border-radius:8px; resize:vertical;
    border:1px solid var(--et-border,#e0e0e0);
    background:var(--et-row-hover,#f9f9f9); color:var(--et-fg,#333);
    font-family:monospace; font-size:12px; line-height:1.5; outline:none;
  `;

  const previewBox = document.createElement('div');
  previewBox.style.cssText = `
    border:1px solid var(--et-border,#e0e0e0); border-radius:8px;
    background:var(--et-row-hover,#f5f5f5); padding:10px;
    max-height:120px; overflow-y:auto;
    font-size:12px; line-height:1.6; display:none;
  `;

  const previewLabel = document.createElement('div');
  previewLabel.style.cssText = 'font-size:11px; font-weight:600; color:#888; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;';
  previewLabel.textContent = 'Preview';

  const previewTickers = document.createElement('div');
  previewTickers.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px;';

  previewBox.appendChild(previewLabel);
  previewBox.appendChild(previewTickers);

  const statsLine = document.createElement('div');
  statsLine.style.cssText = 'font-size:11px; color:#888; min-height:16px;';

  // Prevent clicks on the dark backdrop from stealing focus back to the
  // TradingView page underneath — but only for the backdrop itself.
  // (Previously this also ran on the textarea's own mousedown, which
  // blocked the browser's default focus behavior and made it impossible
  // to click back into the textarea after touching the select dropdown.)
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) e.preventDefault(); });
  ['keydown', 'keyup', 'keypress', 'paste', 'input'].forEach(evt => textarea.addEventListener(evt, e => e.stopPropagation()));

  textarea.addEventListener('input', () => {
    const parsed = Utils.parsePasteText(textarea.value);
    previewTickers.innerHTML = '';
    if (parsed.length === 0) {
      previewBox.style.display = 'none';
      statsLine.textContent = '';
      importBtn.disabled = true;
      importBtn.style.opacity = '0.5';
      return;
    }
    previewBox.style.display = 'block';
    importBtn.disabled = false;
    importBtn.style.opacity = '1';
    parsed.forEach(({ ticker }) => {
      const chip = document.createElement('span');
      chip.style.cssText = `
        display:inline-block; padding:2px 7px; border-radius:4px; font-size:11px;
        font-weight:600; font-family:monospace;
        background:rgba(33,150,243,0.1); color:var(--et-accent,#2196f3);
        border:1px solid rgba(33,150,243,0.25);
      `;
      chip.textContent = ticker;
      previewTickers.appendChild(chip);
    });
    statsLine.innerHTML = `<span style="color:var(--et-accent,#2196f3); font-weight:600;">${parsed.length} stock${parsed.length !== 1 ? 's' : ''}</span>`;
  });

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    padding:8px 16px; border-radius:6px; border:1px solid var(--et-border,#ddd);
    background:transparent; color:var(--et-fg,#333); cursor:pointer; font-size:13px;
  `;
  cancelBtn.onclick = () => overlay.remove();

  const importBtn = document.createElement('button');
  importBtn.textContent = 'Import';
  importBtn.disabled = true;
  importBtn.style.cssText = `
    padding:8px 20px; border-radius:6px; border:none;
    background:var(--et-accent,#2196f3); color:#fff; cursor:pointer;
    font-size:13px; font-weight:600; opacity:0.5;
  `;
  importBtn.onclick = () => {
    const parsed = Utils.parsePasteText(textarea.value);
    if (parsed.length === 0) return;
    const sectionId = secSelect.value;
    // Temporarily set active section for addSymbols
    const wl2 = Store.activeWatchlist;
    const prevActive = wl2.activeSectionId;
    wl2.activeSectionId = sectionId;
    const added = Store.addSymbols(parsed);
    wl2.activeSectionId = prevActive;
    SupabaseService.logEvent('paste_import', { count: parsed.length, added });
    overlay.remove();
    sidebarInstance.renderContent();
    showImportResultToast(shadow, added);
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(importBtn);

  card.appendChild(header);
  card.appendChild(secLabel);
  card.appendChild(secSelect);
  card.appendChild(hint);
  card.appendChild(textarea);
  card.appendChild(statsLine);
  card.appendChild(previewBox);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  shadow.appendChild(overlay);
  setTimeout(() => textarea.focus(), 50);
}

// ─────────────────────────────────────────────────────────────────
//  IMPORT RESULT TOAST
// ─────────────────────────────────────────────────────────────────
function showImportResultToast(shadow, added) {
  const old = shadow.getElementById('et-import-toast');
  if (old) old.remove();
  ensureToastStyles(shadow);
  const toast = document.createElement('div');
  toast.id = 'et-import-toast';
  toast.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    background:${added > 0 ? '#1b5e20' : '#555'}; color:#fff;
    padding:10px 18px; border-radius:8px;
    font-size:13px; font-weight:500; z-index:2147483650;
    box-shadow:0 4px 16px rgba(0,0,0,0.3);
    display:flex; align-items:center; gap:8px;
    animation: et-slidein 0.2s ease; white-space:nowrap;
  `;
  const icon = added > 0 ? '✅' : 'ℹ️';
  const msg = `<strong>${added} stock${added !== 1 ? 's' : ''} added</strong>`;
  toast.innerHTML = `<span style="font-size:15px;">${icon}</span><span>${msg}</span>`;
  shadow.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function ensureToastStyles(shadow) {
  if (shadow.getElementById('et-toast-style')) return;
  const st = document.createElement('style');
  st.id = 'et-toast-style';
  st.textContent = `
    @keyframes et-slidein {
      from { opacity:0; transform:translateX(-50%) translateY(10px); }
      to   { opacity:1; transform:translateX(-50%) translateY(0); }
    }
  `;
  shadow.appendChild(st);
}

// ─────────────────────────────────────────────────────────────────
//  MAIN WATCHLIST COMPONENT
// ─────────────────────────────────────────────────────────────────
export const WatchlistComponent = {
  render(area, sidebarInstance) {
    const wl = Store.activeWatchlist;
    const isSuper = wl.id === 'super';
    const isCompact = true; // Compact mode is now the only mode
    const marketDataEnabled = UpstoxService.isConfigured();

    // For the Super Watchlist, any mutating action (delete/colour/note/move) touches
    // real watchlists elsewhere, so the virtual list here goes stale — force a full
    // remount instead of the normal in-place list re-render.
    const refreshAfterMutation = () => { if (isSuper) sidebarInstance.renderContent(); else renderSymbolList(); };
    const isIndianStock = (ex) => ['NSE', 'BSE', 'NSI'].includes(ex);
    const hostname = window.location.hostname;
    const isZerodha = hostname.includes('zerodha.com');
    const isScreener = hostname.includes('screener.in');

    // ── TOP BAR: watchlist selector + section picker + action buttons ──
    const topBar = document.createElement('div');
    topBar.style.cssText = 'padding:8px 10px; display:flex; flex-direction:column; gap:6px; border-bottom:1px solid var(--et-border,#e0e0e0);';

    // Row 1: watchlist dropdown + utility buttons
    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex; gap:5px; align-items:center;';

    const optionsHtml = Store.state.watchlists.map(w => {
      const label = `${w.name} (${Store.getTotalSymbolCount(w)})`;
      return `<option value="${w.id}" ${w.id === Store.state.activeWatchlistId ? 'selected' : ''}>${label}</option>`;
    }).join('') + `<option value="super" ${isSuper ? 'selected' : ''}>\u2b50 Super Watchlist (${Store.getSuperWatchlistItems().length})</option>`;

    const pasteIcon = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M6 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M8 10h8M8 14h6"/></svg>`;
    const clearIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
    const sortIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="18" x2="12" y2="18"/></svg>`;
    const addSecIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

    row1.innerHTML = `
      <select id="wl-dropdown" style="flex:1; padding:5px; border-radius:4px; border:1px solid var(--et-border,#e0e0e0); background:var(--et-bg,#fff); color:var(--et-fg,#333); font-size:12px;">${optionsHtml}</select>
      <button class="icon-btn" id="btn-new-wl" title="New Watchlist">${ICONS.plus}</button>
      <button class="icon-btn" id="btn-paste-import" title="${isSuper ? 'Switch to a real watchlist to import' : 'Paste Import'}" ${isSuper ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>${pasteIcon}</button>
    `;
    topBar.appendChild(row1);

    // Row 2: section filter + add section
    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex; gap:5px; align-items:center;';

    const secOptionsHtml = [
      `<option value="" ${!wl.activeSectionId ? 'selected' : ''}>All Sections (${Store.getTotalSymbolCount(wl)})</option>`,
      ...wl.sections.map(s => `<option value="${s.id}" ${wl.activeSectionId === s.id ? 'selected' : ''}>${s.name} (${s.symbols.length})</option>`)
    ].join('');

    row2.innerHTML = `
      <select id="section-filter" style="flex:1; padding:5px; border-radius:4px; border:1px solid var(--et-border,#e0e0e0); background:var(--et-bg,#fff); color:var(--et-fg,#333); font-size:12px;" ${isSuper ? 'disabled' : ''}>${secOptionsHtml}</select>
      <button class="icon-btn" id="btn-add-section" title="${isSuper ? 'Not available in Super Watchlist' : 'Add New Section'}" style="color:var(--et-accent); ${isSuper ? 'opacity:0.3;cursor:not-allowed;' : ''}" ${isSuper ? 'disabled' : ''}>${addSecIcon}</button>
      <button class="icon-btn" id="btn-export-wl" title="Export">${ICONS.download}</button>
    `;
    topBar.appendChild(row2);

    // Row 3: colour filter chips
    const row3 = document.createElement('div');
    row3.style.cssText = 'display:flex; gap:4px; align-items:center; padding:0 0 2px;';

    const chips = [
      { label: 'All', color: '' },
      { label: '', color: 'red' },
      { label: '', color: 'yellow' },
      { label: '', color: 'green' },
      { label: 'None', color: 'none' },
    ];
    let activeColorFilter = '';

    function renderColorChips() {
      row3.innerHTML = '';
      chips.forEach(chip => {
        const btn = document.createElement('button');
        const isActive = activeColorFilter === chip.color;
        const dot = chip.color && chip.color !== 'none'
          ? `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${chip.color === 'red' ? '#f44336' : chip.color === 'yellow' ? '#fdd835' : '#4caf50'};flex-shrink:0;"></span>`
          : '';
        const hasText = !!chip.label;
        btn.title = chip.color ? (chip.color === 'none' ? 'No Colour' : chip.color[0].toUpperCase() + chip.color.slice(1)) : 'All';
        btn.style.cssText = `
          display:flex; align-items:center; justify-content:center; gap:3px;
          padding:${hasText ? '3px 9px' : '4px'}; border-radius:20px; font-size:11px;
          ${dot && !hasText ? 'width:22px;height:22px;' : ''}
          border:1px solid ${isActive ? 'var(--et-accent,#2196f3)' : 'var(--et-border,#e0e0e0)'};
          background:${isActive ? 'rgba(33,150,243,0.12)' : 'transparent'};
          color:${isActive ? 'var(--et-accent,#2196f3)' : '#888'};
          cursor:pointer; font-weight:${isActive ? '600' : '400'};
          transition:all 0.15s;
        `;
        btn.innerHTML = `${dot}${chip.label}`;
        btn.onclick = () => {
          activeColorFilter = chip.color;
          renderColorChips();
          renderSymbolList();
        };
        row3.appendChild(btn);
      });
    }
    renderColorChips();
    topBar.appendChild(row3);
    area.appendChild(topBar);

    // Wire up top bar events
    row1.querySelector('#wl-dropdown').onchange = e => {
      Store.state.activeWatchlistId = e.target.value;
      Store.save();
      sidebarInstance.renderContent();
    };
    row1.querySelector('#btn-new-wl').onclick = () => {
      const name = prompt('New Watchlist Name:');
      if (name) { Store.addWatchlist(name); sidebarInstance.renderContent(); }
    };
    row1.querySelector('#btn-paste-import').onclick = () => showPasteImportModal(sidebarInstance.shadow, sidebarInstance);

    // Section filter
    row2.querySelector('#section-filter').onchange = e => {
      Store.setActiveSection(e.target.value || null);
      sidebarInstance.renderContent();
    };
    row2.querySelector('#btn-add-section').onclick = () => {
      showTextInputModal(sidebarInstance.shadow, 'New Section', '', 'Section name (e.g. Breakouts)', name => {
        Store.addSection(name);
        sidebarInstance.renderContent();
      });
    };
    row2.querySelector('#btn-export-wl').onclick = () => {
      const symbols = wl.sections.flatMap(s => s.symbols.map(sym => `${sym.exchange}:${sym.ticker}`)).join(', ');
      const blob = new Blob([symbols], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${wl.name.replace(/\s+/g, '_')}_export.txt`;
      a.click();
    };

    // ── Actions (Scan) ──
    const actions = document.createElement('div');
    actions.style.padding = '10px';
    actions.style.borderBottom = '1px solid var(--et-border, #e0e0e0)';
    actions.innerHTML = '';

    if (isZerodha) {
      actions.innerHTML += `
        <div style="display:flex; gap:5px;">
          <button class="icon-btn" style="flex:1; border:1px solid var(--et-border,#e0e0e0);" id="btn-scan-page">Scan Holdings</button>
        </div>
        <div id="scan-msg" class="status-msg"></div>
      `;
    } else if (isScreener) {
      const totalPages = Scanner.getTotalPages(document);
      const scanAllText = totalPages > 1 ? `Scan All (${totalPages})` : 'Scan All';
      actions.innerHTML += `
        <div style="display:flex; gap:5px;">
          <button class="icon-btn" style="flex:1; border:1px solid var(--et-border,#e0e0e0);" id="btn-scan-page">Scan Page</button>
          <button class="icon-btn" style="flex:1; border:1px solid var(--et-border,#e0e0e0);" id="btn-scan-all">${scanAllText}</button>
        </div>
        <div id="scan-msg" class="status-msg"></div>
      `;
    } else {
      actions.innerHTML += `<div id="scan-msg" class="status-msg"></div>`;
    }
    area.appendChild(actions);

    const handleScan = async all => {
      if (isSuper) { alert('Switch to a real watchlist before scanning.'); return; }
      const msg = actions.querySelector('#scan-msg');
      msg.innerText = all ? 'Scanning pages (max 50)...' : 'Scanning page...';
      SupabaseService.logEvent(all ? 'scan_all' : 'scan_page');
      let count = 0;
      if (all) count = await Scanner.scanAllPages(txt => msg.innerText = txt);
      else { const symbols = await Scanner.scanPage(document); count = Store.addSymbols(symbols); }
      sidebarInstance.renderContent();
      setTimeout(() => {
        const m = sidebarInstance.shadow.getElementById('scan-msg');
        if (m) m.innerText = `Added ${count} symbols.`;
      }, 100);
    };

    const btnScanPage = actions.querySelector('#btn-scan-page');
    if (btnScanPage) btnScanPage.onclick = () => handleScan(false);
    const btnScanAll = actions.querySelector('#btn-scan-all');
    if (btnScanAll) btnScanAll.onclick = () => handleScan(true);

    // ── Symbol list (grouped by section) ──
    const listContainer = document.createElement('div');
    listContainer.id = 'wl-list-container';
    area.appendChild(listContainer);

    // Icons reused in row rendering
    const gripIcon = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.35;cursor:grab;flex-shrink:0;"><circle cx="9" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>`;
    const moveIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 9 2 12 5 15"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`;
    const trashIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

    const dragState = { sectionId: null, index: null };

    // Re-render the symbol list (called by colour filter chips and after any symbol change)
    function renderSymbolList() {
      listContainer.innerHTML = '';

      const activeSectionId = wl.activeSectionId;
      const sectionsToShow = activeSectionId
        ? wl.sections.filter(s => s.id === activeSectionId)
        : wl.sections;

      sectionsToShow.forEach((section) => {
        const globalSecIdx = wl.sections.indexOf(section);
        if (globalSecIdx === -1) return;

        // Apply colour filter: get filtered symbol list
        const filteredSymbols = activeColorFilter
          ? section.symbols.filter(s => (s.color || 'none') === activeColorFilter)
          : section.symbols;

        // ── SECTION HEADER ──
        const secHeader = document.createElement('div');
        secHeader.className = 'sec-header';
        secHeader.style.cssText = `
          display:flex; align-items:center; gap:6px;
          padding:6px 10px; cursor:pointer;
          background:var(--et-row-hover,#f5f5f5);
          border-bottom:1px solid var(--et-border,#e0e0e0);
          user-select:none;
        `;

        const toggleBtn = document.createElement('span');
        toggleBtn.style.cssText = 'font-size:11px; color:#888; width:14px; text-align:center; flex-shrink:0;';
        toggleBtn.textContent = section.isCollapsed ? '>' : 'v';

        const secName = document.createElement('span');
        secName.style.cssText = 'font-size:12px; font-weight:600; color:#555; flex:1;';
        secName.textContent = section.name;

        const secCount = document.createElement('span');
        secCount.style.cssText = 'font-size:11px; color:#aaa; margin-right:4px;';
        secCount.textContent = activeColorFilter ? `${filteredSymbols.length}/${section.symbols.length}` : `${section.symbols.length}`;

        const renameBtn = document.createElement('button');
        renameBtn.className = 'icon-btn';
        renameBtn.title = 'Rename Section';
        renameBtn.style.cssText = 'padding:2px; opacity:0.5; flex-shrink:0;';
        renameBtn.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
        renameBtn.onclick = e => {
          e.stopPropagation();
          showTextInputModal(sidebarInstance.shadow, 'Rename Section', section.name, 'Section name', newName => {
            Store.renameSection(section.id, newName);
            sidebarInstance.renderContent();
          });
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'icon-btn';
        deleteBtn.title = wl.sections.length > 1 ? 'Delete Section' : 'Cannot delete last section';
        deleteBtn.style.cssText = `padding:2px; flex-shrink:0; ${wl.sections.length <= 1 ? 'opacity:0.2;cursor:not-allowed;' : 'opacity:0.5;'}`;
        deleteBtn.innerHTML = trashIcon;
        if (wl.sections.length > 1) {
          deleteBtn.onclick = e => {
            e.stopPropagation();
            if (confirm(`Delete section "${section.name}"? Its ${section.symbols.length} stock${section.symbols.length !== 1 ? 's' : ''} will move to Main.`)) {
              Store.deleteSection(section.id);
              sidebarInstance.renderContent();
            }
          };
        }

        secHeader.appendChild(toggleBtn);
        secHeader.appendChild(secName);
        secHeader.appendChild(secCount);
        secHeader.appendChild(renameBtn);
        secHeader.appendChild(deleteBtn);

        secHeader.onclick = () => {
          Store.toggleSectionCollapse(section.id);
          sidebarInstance.renderContent();
        };

        // ── SECTION-LEVEL DROP ZONE ──
        // Lets a stock be dropped onto the section header itself (appends to end
        // of that section). This is what makes dropping into a section that has
        // no rows yet — e.g. an emptied-out "Main" — actually work, since the
        // per-row drop handlers below only exist when a section has items.
        secHeader.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
        secHeader.addEventListener('dragenter', e => {
          e.preventDefault();
          if (dragState.sectionId === section.id) return;
          secHeader.classList.add('drag-over');
        });
        secHeader.addEventListener('dragleave', () => secHeader.classList.remove('drag-over'));
        secHeader.addEventListener('drop', e => {
          e.preventDefault();
          secHeader.classList.remove('drag-over');
          const fromSecId = dragState.sectionId;
          const fromIdx = dragState.index;
          if (fromSecId == null || fromIdx == null || fromSecId === section.id) return;
          const wl2 = Store.activeWatchlist;
          const fromSec = wl2.sections.find(s => s.id === fromSecId);
          const toSec = wl2.sections.find(s => s.id === section.id);
          if (fromSec && toSec) {
            const [sym] = fromSec.symbols.splice(fromIdx, 1);
            toSec.symbols.push(sym);
            Store.save();
          }
          renderSymbolList();
        });

        listContainer.appendChild(secHeader);

        // ── SECTION ROWS ──
        if (!section.isCollapsed) {
          filteredSymbols.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'wl-item' + (isCompact ? ' compact' : '');
            row.draggable = !isSuper;
            row.dataset.secId = section.id;
            row.dataset.index = index;
            row.dataset.mktKey = `${item.exchange}:${item.ticker}`;

            const isUnsupportedOnCurrentSite = (isZerodha || isScreener) && !isIndianStock(item.exchange);
            const hasNote = item.note && item.note.trim().length > 0;

            const sourceTag = isSuper
              ? (() => {
                  const src = Store.findSymbolSource(item.ticker, item.exchange);
                  return src ? `<span style="font-size:8px;color:#888;background:var(--et-row-hover,#f0f0f0);border-radius:3px;padding:1px 4px;flex-shrink:0;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${src.watchlistName}">${src.watchlistName}</span>`
                  : '';
                })()
              : '';

            const mktBadges = marketDataEnabled
              ? `<span class="mkt-arrow" style="flex-shrink:0;width:14px;display:flex;align-items:center;justify-content:center;"></span>
                 <span class="mkt-rvol" style="display:none;flex-shrink:0;font-size:9px;font-weight:700;color:#fff;padding:2px 5px;border-radius:3px;line-height:1.3;"></span>`
              : '';

            if (hasNote) row.classList.add('has-note');

            const noteIcon = hasNote
              ? `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`
              : `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.25;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

            const noteBadge = hasNote ? `<span style="position:absolute;top:3px;right:3px;width:6px;height:6px;background:var(--et-accent,#2196f3);border-radius:50%;display:block;"></span>` : '';

            if (isCompact) {
              row.style.cssText = 'display:flex; align-items:center; padding:4px 8px 4px 4px; border-bottom:1px solid var(--et-border,#e8e8e8); gap:4px; position:relative;';
              row.innerHTML = `
                <span style="flex-shrink:0;cursor:grab;" class="drag-handle">${gripIcon}</span>
                <div class="color-marker ${item.color || 'none'}" style="width:3px;height:18px;flex-shrink:0;"></div>
                <div class="ticker-box" style="flex:1;cursor:pointer;position:relative;min-width:0;">
                  <span style="font-weight:600;font-size:11px;">${item.ticker}</span>
                  ${noteBadge}
                </div>
                ${sourceTag}
                ${mktBadges}
                <span style="font-size:9px;color:#888;flex-shrink:0;">${item.exchange}</span>
                <button class="icon-btn move-btn" title="Move" style="padding:2px;flex-shrink:0;opacity:0.5;">${moveIcon}</button>
                <button class="icon-btn note-btn" title="${hasNote ? 'Edit Note' : 'Add Note'}" style="padding:2px;flex-shrink:0;">${noteIcon}</button>
                <button class="icon-btn del-btn" title="Remove" style="padding:2px;flex-shrink:0;">${trashIcon}</button>
              `;
            } else {
              row.style.cssText = 'display:flex; align-items:center; padding:7px 8px; border-bottom:1px solid var(--et-border,#e8e8e8); gap:5px; position:relative;';
              row.innerHTML = `
                <span style="flex-shrink:0;cursor:grab;" class="drag-handle">${gripIcon}</span>
                <div class="color-marker ${item.color || 'none'}"></div>
                <div class="ticker-box" style="flex:1;cursor:pointer;position:relative;min-width:0;">
                  <div style="font-weight:600;font-size:13px;">${item.ticker}</div>
                  <div style="font-size:10px;color:#888;">${item.exchange}</div>
                  ${noteBadge}
                </div>
                ${sourceTag}
                ${mktBadges}
                <button class="icon-btn note-btn" title="${hasNote ? 'Edit Note' : 'Add Note'}" style="padding:3px;flex-shrink:0;">${noteIcon}</button>
                <button class="icon-btn" id="scr-${item.ticker}" title="Screener"
                  ${isUnsupportedOnCurrentSite ? 'disabled style="opacity:0.2;cursor:not-allowed;"' : ''}>${ICONS.screener}</button>
                <button class="icon-btn" id="tv-${item.ticker}" title="TradingView" style="flex-shrink:0;">${ICONS.tv}</button>
                <button class="icon-btn move-btn" title="Move" style="padding:3px;flex-shrink:0;opacity:0.5;">${moveIcon}</button>
                <button class="icon-btn del-btn" title="Remove" style="flex-shrink:0;">${trashIcon}</button>
              `;
            }

            // ── MARKET DATA BADGES (paint any cached values immediately) ──
            if (marketDataEnabled) {
              const cached = UpstoxService.getCached(item.ticker, item.exchange);
              if (cached) applyIndicatorsToRow(row, cached);
            }

            // ── DRAG & DROP ──
            row.addEventListener('dragstart', e => {
              dragState.sectionId = section.id;
              dragState.index = index;
              row.style.opacity = '0.45';
              e.dataTransfer.effectAllowed = 'move';
            });
            row.addEventListener('dragend', () => {
              row.style.opacity = '';
              dragState.sectionId = null;
              dragState.index = null;
              listContainer.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            });
            row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
            row.addEventListener('dragenter', e => {
              e.preventDefault();
              if (dragState.sectionId === section.id && parseInt(row.dataset.index) === dragState.index) return;
              row.classList.add('drag-over');
            });
            row.addEventListener('dragleave', () => { row.classList.remove('drag-over'); });
            row.addEventListener('drop', e => {
              e.preventDefault();
              const fromSecId = dragState.sectionId;
              const fromIdx = dragState.index;
              const toSecId = section.id;
              const toIdx = parseInt(row.dataset.index);
              if (fromSecId === toSecId && fromIdx === toIdx) return;
              if (fromSecId === toSecId) {
                Store.reorderSymbol(fromIdx, toIdx, toSecId);
              } else {
                const wl2 = Store.activeWatchlist;
                const fromSec = wl2.sections.find(s => s.id === fromSecId);
                const toSec = wl2.sections.find(s => s.id === toSecId);
                if (fromSec && toSec) {
                  const [sym] = fromSec.symbols.splice(fromIdx, 1);
                  toSec.symbols.splice(toIdx, 0, sym);
                  Store.save();
                }
              }
              renderSymbolList();
            });

            // ── COLOUR TOGGLE ──
            row.querySelector('.color-marker').onclick = e => {
              e.stopPropagation();
              Store.toggleColor(item.ticker, section.id);
              refreshAfterMutation();
            };

            // ── MOVE BUTTON (cross-watchlist modal) ──
            row.querySelector('.move-btn').onclick = e => {
              e.stopPropagation();
              showMoveToWatchlistModal(sidebarInstance.shadow, item.ticker, item.exchange, () => refreshAfterMutation());
            };

            // ── NOTE BUTTON ──
            row.querySelector('.note-btn').onclick = e => {
              e.stopPropagation();
              showNotesModal(sidebarInstance.shadow, item.ticker, item.exchange, item.note || '', note => {
                Store.updateNote(item.ticker, note, section.id);
                refreshAfterMutation();
              });
            };

            // ── TICKER CLICK ──
            const tickerBox = row.querySelector('.ticker-box');
            tickerBox.onclick = async e => {
              if (isUnsupportedOnCurrentSite) { alert(`This stock is from ${item.exchange}. Use TradingView.`); return; }
              let ticker = item.ticker;
              let exchange = item.exchange;
              if (exchange === 'BSE' && /^\d+$/.test(ticker)) {
                const resolved = await Utils.resolveSymbol(ticker);
                ticker = resolved.ticker;
              }
              const isTv = window.location.hostname.includes('tradingview.com');
              const url = isTv
                ? `https://in.tradingview.com/chart/?symbol=${exchange}:${ticker}`
                : `https://www.screener.in/company/${item.ticker}/`;
              sidebarInstance.arm();
              if (e.ctrlKey || e.metaKey) { window.open(url, '_blank'); }
              else if (isTv) {
                const success = await sidebarInstance.setTradingViewSymbol(`${exchange}:${ticker}`);
                if (!success) window.location.href = url;
              } else { window.location.href = url; }
            };

            // ── DELETE ──
            row.querySelector('.del-btn').onclick = e => {
              e.stopPropagation();
              if (isSuper) Store.removeSymbolFromAnyWatchlist(item.ticker, item.exchange);
              else Store.removeSymbol(item.ticker);
              refreshAfterMutation();
            };

            // ── SCREENER & TV BUTTONS (non-compact) ──
            if (!isCompact) {
              const scrBtn = row.querySelector(`[id="scr-${item.ticker}"]`);
              if (scrBtn) {
                scrBtn.onclick = e => {
                  e.stopPropagation();
                  if (isUnsupportedOnCurrentSite) { alert(`Not supported on Screener.in.`); return; }
                  SupabaseService.logEvent('open_screener', { symbol: item.ticker });
                  window.open(`https://www.screener.in/company/${item.ticker}/`, '_blank');
                };
              }
              const tvBtn = row.querySelector(`[id="tv-${item.ticker}"]`);
              if (tvBtn) {
                tvBtn.onclick = async e => {
                  e.stopPropagation();
                  let t = item.ticker;
                  if (item.exchange === 'BSE' && /^\d+$/.test(t)) {
                    const resolved = await Utils.resolveSymbol(t);
                    t = resolved.ticker;
                  }
                  SupabaseService.logEvent('open_tv', { symbol: item.ticker, exchange: item.exchange });
                  window.open(`https://in.tradingview.com/chart/?symbol=${item.exchange}:${t}`, '_blank');
                };
              }
            }

            listContainer.appendChild(row);
          });

          // Empty state for this section
          if (filteredSymbols.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'sec-empty-dropzone';
            empty.style.cssText = 'padding:12px; text-align:center; font-size:12px; color:#aaa;';
            empty.textContent = activeColorFilter
              ? `No stocks with "${activeColorFilter}" colour in this section`
              : 'No stocks in this section';
            empty.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
            empty.addEventListener('dragenter', e => {
              e.preventDefault();
              if (dragState.sectionId === section.id) return;
              empty.classList.add('drag-over');
            });
            empty.addEventListener('dragleave', () => empty.classList.remove('drag-over'));
            empty.addEventListener('drop', e => {
              e.preventDefault();
              empty.classList.remove('drag-over');
              const fromSecId = dragState.sectionId;
              const fromIdx = dragState.index;
              if (fromSecId == null || fromIdx == null || fromSecId === section.id) return;
              const wl2 = Store.activeWatchlist;
              const fromSec = wl2.sections.find(s => s.id === fromSecId);
              const toSec = wl2.sections.find(s => s.id === section.id);
              if (fromSec && toSec) {
                const [sym] = fromSec.symbols.splice(fromIdx, 1);
                toSec.symbols.push(sym);
                Store.save();
              }
              renderSymbolList();
            });
            listContainer.appendChild(empty);
          }
        }
      });

      // Global empty state
      if (listContainer.children.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:24px; text-align:center; font-size:13px; color:#aaa;';
        empty.textContent = 'No stocks in this watchlist yet';
        listContainer.appendChild(empty);
      }

      // ── MARKET DATA REFRESH (prev-day-high arrow + relative volume) ──
      // Cached values were already painted synchronously per-row above; this fetches
      // anything stale/missing and patches those rows in place once it lands.
      if (marketDataEnabled) {
        const visiblePairs = sectionsToShow.flatMap(section => {
          const list = activeColorFilter ? section.symbols.filter(s => (s.color || 'none') === activeColorFilter) : section.symbols;
          return list.map(s => ({ ticker: s.ticker, exchange: s.exchange }));
        });
        UpstoxService.refreshBatch(visiblePairs, (ck, indicators) => {
          const row = listContainer.querySelector(`[data-mkt-key="${CSS.escape(ck)}"]`);
          if (row) applyIndicatorsToRow(row, indicators);
        });
      }
    }

    // Initial render
    renderSymbolList();
  }
};
