# TM Watchlist — Chrome extension

Source for the TM Watchlist extension (v3.17.1) that powers the "One Watchlist. Every Platform."
section on the site.

The built ZIP the site serves for download is generated from this folder — see
[Build](#build-the-downloadable-zip).

## Install locally (for development)

1. `chrome://extensions` → turn on **Developer mode** (top right).
2. **Load unpacked** → select `extension/tm_watchlist_v317/` (the folder containing `manifest.json`).
3. Open Screener.in, TradingView, or Kite. The sidebar injects automatically.

If you edit anything under `src/`, re-run `node build.cjs` (below) and then hit **Reload** on the
`chrome://extensions` card — `src/bundle.js` is what Chrome actually loads.

## Build the downloadable ZIP

`bundle.js` must be rebuilt before packaging; Chrome loads that single file, not the ES modules.

```bash
cd extension/tm_watchlist_v317
node build.cjs                     # regenerates src/bundle.js from src/*.js
cd ../..
zip -r public/tm-watchlist-v3.17.1.zip extension/tm_watchlist_v317
```

Skip `_metadata/` — it's a Chrome packaging artifact, not source.

Bump the version in `manifest.json` and update `EXTENSION_FILE` in `src/routes/index.tsx` when you
cut a release, so the filename on the site keeps matching the build.

## How it fits together

```
manifest.json
src/
  background.js          service worker: toolbar toggle, Ctrl+Shift+A, uninstall URL
  bundle.js              GENERATED — all of src/ concatenated into one classic script
  content.js             entry point: boots Store, Sidebar, Injector
  store.js               watchlist state in chrome.storage.local (etData_v3)
  journal-sync.js        writes watchlists into the journal site (see below)
  sidebar.js             the dockable sidebar shell
  injector.js            adds WList / TrVw columns to Screener.in tables
  scanner.js             bulk symbol scanner
  tv-toolbar.js          native-looking button in TradingView's right toolbar
  services/upstox.js     live price badges (needs your own Upstox token)
  services/supabase.js   feedback + analytics backend
  components/            sidebar views: watchlist, settings, feedback
```

`build.cjs` concatenates files in a fixed order (see `FILES_IN_ORDER`) and strips `import`/`export`
statements, so Chrome never has to resolve a dynamic-import chain at runtime. That ordering matters:
`sidebar.js` constructs a `Sidebar` at load time, so it must come after its dependencies.

## Trading Journal Sync

Settings → **Trading Journal Sync** pushes your watchlists to the journal site. It writes two keys
into the site's `localStorage`:

- `tj_watchlists` — `{ lists: [{ name, items: [{ ticker, exchange, color, note }] }] }`
- `tj_wl_settings` — display preferences for the site's Watchlist tab

The site's own sync layer (`src/lib/journal-sync.ts` in the parent app) mirrors any `tj_`-prefixed key
to Firestore, so anything written here shows up on every signed-in device. The extension needs
`scripting` (already in `manifest.json`) plus the journal domain in `host_permissions`, because it
injects a script into the journal tab to write those keys.

To point at a different deployment, change the URL in Settings, or edit `DEFAULT_JOURNAL_URL` in
`src/journal-sync.js` and the matching `host_permissions` entry in `manifest.json`.

## Feedback backend

`src/services/supabase.js` points at an external Supabase project for feedback tickets and anonymous
analytics. It is independent of the site, which uses Firebase throughout. Every call in that file
fails soft (returns `null` on error), so if that backend is unavailable the extension keeps working
— you just lose feedback submission and event logging.

> The `APP_SECRET` in that file is a hardcoded credential that ships with every copy of the
> extension. Replace it with your own backend before publishing this publicly.
