# Wealthline

The world's biggest fortunes. In motion. A web-hosted React Native app (Expo SDK 58, Expo Router, React Native Web, Supabase); native iOS/Android builds come later from the same code.

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

On a phone on the same Wi-Fi: `npm run preview:phone` builds the production web app, serves it, and puts a QR pointing at this computer on the preview page.

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
