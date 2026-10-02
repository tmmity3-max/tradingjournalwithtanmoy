# Sync & Go — Trading Journal Pro

Cloud-synced trading journal with Google login, multi-device sync, and Chrome extension linking via codes.

**Live app:** https://tradingjournalwithtanmoy.lovable.app  
**Also:** https://tradingjournalwithtanmoy.vercel.app

Built with [Lovable](https://lovable.dev). Continue in the [Lovable editor](https://lovable.dev/projects/b483ffae-7e25-4a13-b7d6-ecc1fd7a50b0).

---

## Features

- Google / Email login + Firestore sync across devices
- Trading journal (trades, charts, rules, capital ledger, position sizer)
- Watchlist report view (managed by the TM Watchlist Chrome extension)
- **Extension linking codes** (max 3 per account) — paste once in the extension; stays linked until revoked
- **Direct cloud sync from the extension** — watchlists push to Firestore every ~8 seconds even when the website is closed

---

## How to link the Chrome extension

1. Log in to the website with Google.
2. Open **Settings** (bottom of the left sidebar) → **Extension Linking Codes** → **Generate Code**.
3. In the **TM Watchlist** extension → **Settings → Trading Journal Sync**:
   - Paste the code → **Link**
   - Then **Connect & Sync**
4. Your watchlists appear on the website on every device.  
   After the first link, the extension pushes to the database automatically every ~8 seconds **without the website being open**.  
   Revoke a code anytime in website Settings to unlink that extension instance.

---

## Firebase setup (Auth + Firestore, free Spark plan)

1. Create a project at https://console.firebase.google.com (skip Analytics).
2. **Authentication → Sign-in method:** enable **Google** and **Email/Password**.
3. **Firestore Database → Create database** (production mode), then paste `firestore.rules` into the Rules tab and Publish.
4. **Project settings → Your apps → Web (`</>`):** register an app and copy the config values into `.env` (see `.env.example`).
5. **Authentication → Settings → Authorized domains:** add the domain you deploy to.
6. Run locally: `npm i && npm run dev`.

### Data layout

| Path | Purpose |
|------|---------|
| `users/{uid}/journal/{key}` | Journal data (trades, rules, link codes, etc.) |
| `users/{uid}/charts/{id}` | Chart screenshots |
| `users/{uid}/private/upstox` | Upstox token (written by server functions) |
| `linkCodes/{code}` | Maps an extension linking code → uid (public read; owner write) |

Link codes are stored in journal data under the key `tj_link_codes` (max 3 active codes per account) and also registered in the top-level `linkCodes` collection so the extension can authenticate writes without Google login.

Server functions (Upstox prices) need a Node/edge host — deploy to **Vercel**, Cloudflare or Netlify and set the same `VITE_FIREBASE_*` variables there. Firebase Hosting alone can’t run them on the free plan.

The public endpoint `/api/firebase-public-config` exposes `projectId` + `apiKey` (already public in the web client) so the extension can talk to Firestore.

---

## Local development

```bash
npm i
npm run dev
```

Extension source: `extension/tm_watchlist_v317/`. Reload the unpacked extension after pulling changes to see the linking-code field and direct sync.
