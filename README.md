# Sync & Go

i want same website, no changes. with login features & data sync in multiple device

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://tradingjournalwithtanmoy.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b483ffae-7e25-4a13-b7d6-ecc1fd7a50b0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Firebase setup (Auth + Firestore, free Spark plan)

1. **Create a project** at https://console.firebase.google.com (skip Analytics).
2. **Authentication -> Sign-in method:** enable **Google** and **Email/Password**.
3. **Firestore Database -> Create database** (production mode), then paste `firestore.rules` into the Rules tab and Publish.
4. **Project settings -> Your apps -> Web (</>)**: register an app and copy the config values into `.env` (see `.env.example`).
5. **Authentication -> Settings -> Authorized domains:** add the domain you deploy to.
6. Run locally: `npm i && npm run dev`.

Data layout: `users/{uid}/journal/{key}` (journal data), `users/{uid}/charts/{id}` (chart screenshots), `users/{uid}/private/upstox` (Upstox token, written by server functions).

Server functions (Upstox prices) need a Node/edge host, so deploy to Vercel, Cloudflare or Netlify and set the same `VITE_FIREBASE_*` variables there. Firebase Hosting alone can't run them on the free plan.
