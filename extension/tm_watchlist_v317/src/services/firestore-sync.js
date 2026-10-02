/**
 * FirestoreSync — push watchlists directly to Firestore using a linking code.
 *
 * Flow:
 *  1. Look up linkCodes/{code} → { uid }
 *  2. Write users/{uid}/journal/tj_watchlists and tj_wl_settings
 *     with a linkCode field so Firestore rules allow the unauthenticated write.
 *
 * Firebase project config is fetched once from the journal site
 * (/api/firebase-public-config) and cached in chrome.storage.
 */

const DEFAULT_JOURNAL = 'https://tradingjournalwithtanmoy.vercel.app';
const WL_KEY = 'tj_watchlists';
const WL_SET_KEY = 'tj_wl_settings';
const DEFAULT_WL_SETTINGS = {
  defaultList: '',
  defaultFlag: '',
  sort: 'manual',
  showTradingView: true,
  showScreener: true
};

let _cfg = null; // { projectId, apiKey }
let _uidCache = {}; // code → uid
let _lastPayloadJson = '';

async function loadConfig() {
  if (_cfg?.projectId && _cfg?.apiKey) return _cfg;

  const stored = await chrome.storage.local.get(['tjFirebaseConfig']);
  if (stored.tjFirebaseConfig?.projectId && stored.tjFirebaseConfig?.apiKey) {
    _cfg = stored.tjFirebaseConfig;
    return _cfg;
  }

  // Ask the journal site for its public Firebase identifiers
  const bases = [
    DEFAULT_JOURNAL,
    'https://tradingjournalwithtanmoy.lovable.app'
  ];
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/firebase-public-config`, {
        method: 'GET',
        cache: 'no-store'
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json?.projectId && json?.apiKey) {
        _cfg = { projectId: json.projectId, apiKey: json.apiKey };
        await chrome.storage.local.set({ tjFirebaseConfig: _cfg });
        return _cfg;
      }
    } catch (e) {
      // try next
    }
  }
  return null;
}

function docPath(projectId, ...segments) {
  const encoded = segments.map((s) => encodeURIComponent(s)).join('/');
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${encoded}`;
}

async function lookupUid(code) {
  if (_uidCache[code]) return _uidCache[code];
  const cfg = await loadConfig();
  if (!cfg) throw new Error('Firebase config unavailable');

  const url = `${docPath(cfg.projectId, 'linkCodes', code)}?key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(url);
  if (res.status === 404) throw new Error('Linking code not found or revoked');
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  const body = await res.json();
  const uid = body?.fields?.uid?.stringValue;
  if (!uid) throw new Error('Linking code has no uid');
  _uidCache[code] = uid;
  return uid;
}

async function writeJournalKey(uid, key, value, linkCode) {
  const cfg = await loadConfig();
  if (!cfg) throw new Error('Firebase config unavailable');

  // Document id is encodeURIComponent(key) to match the website's journal-sync.ts
  const docId = encodeURIComponent(key);
  const url = `${docPath(cfg.projectId, 'users', uid, 'journal', docId)}?key=${encodeURIComponent(cfg.apiKey)}`;

  const fields = {
    key: { stringValue: key },
    value: { stringValue: typeof value === 'string' ? value : JSON.stringify(value) },
    linkCode: { stringValue: linkCode }
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Write ${key} failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

function buildPayload(state) {
  if (!state || !Array.isArray(state.watchlists)) return { lists: [] };
  return {
    lists: state.watchlists
      .filter((wl) => !wl.isVirtual)
      .map((wl) => ({
        name: wl.name,
        items: (wl.sections || []).flatMap((sec) =>
          (sec.symbols || []).map((s) => ({
            ticker: s.ticker,
            exchange: s.exchange,
            color: s.color || 'none',
            note: s.note || ''
          }))
        )
      }))
  };
}

/**
 * Push current watchlists to Firestore using the saved linking code.
 * Returns { ok, lists, items, skipped?, error? }
 */
export async function pushDirect(state, linkCode) {
  const code = (linkCode || '').trim().toUpperCase();
  if (!code || code.length < 6) return { ok: false, skipped: true, reason: 'no-code' };

  const payload = buildPayload(state);
  const payloadJson = JSON.stringify(payload);
  // Skip network if nothing changed since last successful push
  if (payloadJson === _lastPayloadJson) {
    return { ok: true, skipped: true, reason: 'unchanged', lists: payload.lists.length };
  }

  try {
    const uid = await lookupUid(code);
    await writeJournalKey(uid, WL_KEY, payloadJson, code);
    await writeJournalKey(uid, WL_SET_KEY, JSON.stringify(DEFAULT_WL_SETTINGS), code);
    _lastPayloadJson = payloadJson;

    const items = payload.lists.reduce((n, l) => n + l.items.length, 0);
    await chrome.storage.local.set({
      lastJournalSync: {
        at: Date.now(),
        lists: payload.lists.length,
        items,
        url: 'firestore-direct',
        auto: true,
        direct: true
      }
    });
    return { ok: true, lists: payload.lists.length, items, uid };
  } catch (e) {
    console.warn('[FirestoreSync]', e.message || e);
    return { ok: false, error: e.message || String(e) };
  }
}

/** Clear cached uid when the user changes/revokes the code. */
export function clearUidCache() {
  _uidCache = {};
  _lastPayloadJson = '';
}
