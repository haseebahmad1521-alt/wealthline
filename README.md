# Wealthline

The world's biggest fortunes. In motion. One Expo app for iOS, Android, and the web (Expo SDK 58, Expo Router, Supabase).

Requirements: `CLAUDE.md` (owner), `HANDOFF.md`, `PRODUCT.md`. Plan and status: `PLAN.md`.

## Setup

```bash
npm ci
```

Fill in `.env` (git-ignored) with the Supabase project URL and publishable key. Both are public client values; never put a secret key there. Backend setup (migrations, Edge Functions, email templates, admin) is in `supabase/README.md`.

## Run

```bash
npm run web
```

Native on your own phone, no Xcode needed: install **Expo Go**, run `npx expo start`, and scan the QR it prints. That is the **Expo development QR**: it opens the real native app in Expo Go and needs your phone on the same network as this Mac.

## Checks

```bash
npm run typecheck
npm test
```

## Web preview (GitHub Pages)

```bash
npm run build:pages
npm run preview:pages
```

`build:pages` exports the app under `/wealthline/app/`, adds the PWA service worker, and assembles the iPhone-frame presentation shell at `/wealthline/` with a QR and the commit id. `preview:pages` serves that exact artifact locally with Pages-like 404 behaviour.

A **web preview QR** (opens a browser, not Expo Go):

```bash
npm run preview:qr -- --url https://haseebahmad1521-alt.github.io/wealthline/
```

Images go to `preview-artifacts/`. A QR for `localhost` won't work from a phone; use your LAN IP or a tunnel.

Deployment is automatic on push to `main` or `rebuild` (`.github/workflows/pages.yml`). One-time repository setup: Settings → Pages → Source: GitHub Actions, and repository variables `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Pages on a private repository needs a paid GitHub plan.

Nested routes on Pages are recovered by `404.html` (the first response is an HTTP 404; GitHub Pages has no server rewrites).

## Importing the old Bilt data

Fill `BILT_URL` and `BILT_ANON_KEY` in `.env`, then:

```bash
npm run import:bilt
```

It writes `supabase/import/bilt-import.sql` (git-ignored until reviewed) and prints counts, including the estimate/computed split to confirm.
