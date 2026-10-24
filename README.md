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

That's the development server. To try the real app on a phone, use the live preview below.

## Checks

```bash
npm run typecheck
npm test
```

## Web preview (GitHub Pages)

Live preview (iPhone frame, QR, commit id): https://haseebahmad1521-alt.github.io/wealthline/
App: https://haseebahmad1521-alt.github.io/wealthline/app/

Every push to `rebuild` builds and deploys it (`.github/workflows/pages.yml` runs `npm run build:pages`, which exports the app under `/wealthline/app/`, adds the PWA service worker, and assembles the shell with a QR for the public URL and the commit id). Scan the QR on the preview page to open the app on a phone.

One-time repository setup (done): Settings → Pages → Source: GitHub Actions; repository variables `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A QR for another URL: `npm run preview:qr -- --url <https-url>` (written to `preview-artifacts/`).

Nested routes on Pages are recovered by `404.html` (the first response is an HTTP 404; GitHub Pages has no server rewrites).

## Importing the old Bilt data

Fill `BILT_URL` and `BILT_ANON_KEY` in `.env`, then:

```bash
npm run import:bilt
```

It writes `supabase/import/bilt-import.sql` (git-ignored until reviewed) and prints counts, including the estimate/computed split to confirm.
