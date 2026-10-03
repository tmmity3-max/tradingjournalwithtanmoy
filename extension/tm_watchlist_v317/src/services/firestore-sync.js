/**
 * FirestoreSync — push watchlists directly to Firestore using the signed-in
 * Firebase Google account.
 *
 * Flow:
 *  1. The extension authenticates with Google through the journal's Firebase project.
 *  2. The extension receives a Firebase ID token + uid.
 *  3. It writes users/{uid}/journal/* with Authorization: Bearer <ID token>.
 *
 * Linking codes remain supported only as a legacy fallback for older installs.
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

  try {
    const res = await fetch('https://tradingjournalwithtanmoy.vercel.app/api/firebase-public-config', {
      method: 'GET',
      cache: 'no-store'
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.projectId && json?.apiKey) {
      _cfg = { projectId: json.projectId, apiKey: json.apiKey };
      await chrome.storage.local.set({ tjFirebaseConfig: _cfg });
      return _cfg;
    }
  } catch (e) {
    console.warn('[FirestoreSync] Firebase config load failed', e);
  }
  return null;
}

function docPath(projectId, ...segments) {
  const encoded = segments.map((s) => encodeURIComponent(s)).join('/');
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${encoded}`;
}

async function lookupUid(code) {
  const cfg = await loadConfig();
  if (!cfg) throw new Error('Firebase config unavailable');
  const url = `${docPath(cfg.projectId, 'linkCodes', code)}?key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(url);
  if (res.status === 404) throw new Error('Legacy linking code not found or revoked');
  if (!res.ok) throw new Error(`Legacy link lookup failed (${res.status})`);
  const body = await res.json();
  const uid = body?.fields?.uid?.stringValue;
  if (!uid) throw new Error('Legacy linking code has no uid');
  return uid;
}

async function writeJournalKey(uid, key, value, auth) {
  const cfg = await loadConfig();
  if (!cfg) throw new Error('Firebase config unavailable');

  const docId = encodeURIComponent(key);
  const url = `${docPath(cfg.projectId, 'users', uid, 'journal', docId)}`;
  const fields = {
    key: { stringValue: key },
    value: { stringValue: typeof value === 'string' ? value : JSON.stringify(value) }
  };

  const headers = { 'Content-Type': 'application/json' };
  if (auth?.idToken) headers.Authorization = `Bearer ${auth.idToken}`;
  else if (auth?.linkCode) fields.linkCode = { stringValue: auth.linkCode };
  else throw new Error('Google sign-in required');

  const res = await fetch(url, {
    method: 'PATCH',
    headers,
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
export async function pushDirect(state, linkCode, authSession) {
  const code = (linkCode || '').trim().toUpperCase();
  const auth = authSession?.idToken
    ? authSession
    : (code ? { linkCode: code } : null);

  if (!auth) return { ok: false, skipped: true, reason: 'auth-required' };

  const payload = buildPayload(state);
  const payloadJson = JSON.stringify(payload);
  if (payloadJson === _lastPayloadJson) {
    return { ok: true, skipped: true, reason: 'unchanged', lists: payload.lists.length };
  }

  try {
    const uid = auth.uid || await lookupUid(code);
    await writeJournalKey(uid, WL_KEY, payloadJson, auth);
    await writeJournalKey(uid, WL_SET_KEY, JSON.stringify(DEFAULT_WL_SETTINGS), auth);
    _lastPayloadJson = payloadJson;

    const items = payload.lists.reduce((n, l) => n + l.items.length, 0);
    await chrome.storage.local.set({
      lastJournalSync: {
        at: Date.now(),
        lists: payload.lists.length,
        items,
        url: 'firestore-auth',
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
