# Wealthline — build plan

Plan of record for taking Wealthline over from Bilt into Claude Code. Requirements live in `CLAUDE.md` and `HANDOFF.md`; this file sequences them and records state. Each phase lists its lead model (see “Working conventions” in `CLAUDE.md`).

Repository: <https://github.com/haseebahmad1521-alt/wealthline> (private, default branch `main`). Working branch: `feat/wealthline-takeover`.

## Phase 0 — Takeover setup ✅ (Oct 23, 2026)

- [x] Local folder attached to the GitHub repo; local `CLAUDE.md`/`HANDOFF.md` verified identical to `main`.
- [x] `npm ci` on Node 24.21 / npm 11.19 (lockfile declares npm 10.9; install succeeded).
- [x] Impeccable installed project-scoped (skill, 4 agents, design-check hooks in `settings.local.json`).
- [x] Ponytail plugin installed project-scoped (`.claude/settings.json`).
- [x] `.claude/` and `dist/` excluded from oxlint/oxfmt; `HANDOFF.md` excluded from oxfmt to keep the owner doc verbatim.
- [x] `.env.example` for the two public Bilt client values; `.env`/`.env.local` git-ignored.
- [x] Baseline export fix: `web.favicon` pointed at `icon-192.png` (Expo’s favicon generator rejects the SVG — `export:web` failed on untouched code).

### Baseline check results (untouched app code)

| Check | Result |
| --- | --- |
| `npm run lint` | Pass (2 warnings: unnecessary `!` assertions in `lib/bilt.ts`) |
| `npm run lint:css` | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run format:check` | Pass (after ignore changes) |
| `npm run expo-check` | **Fail**: `expo` 57.0.30 → ~57.0.31, `expo-router` 57.0.28 → ~57.0.29 |
| `npm run export:web` | **Failed** on SVG favicon → passes after fix |
| App against backend | **Not run**: no `EXPO_PUBLIC_BILT_*` values available |
| iOS simulator | **Unavailable**: full Xcode not installed (only Command Line Tools) |
| Android emulator | **Unavailable**: no Android SDK |

### Audit findings so far

- All data, auth (email OTP), watchlists, admin, and the `update-net-worth` function live on the Bilt-hosted backend via `@biltme/backend` (Supabase-style client). Nothing in the repo runs without the public URL + anon key.
- Bilt-preview leftovers: `lib/posthog.ts` (only activates inside an iframe with `__ph_*` query params) and `lib/reportPreviewError.ts` (postMessage to a parent frame). Harmless; the phone-preview iframe will trigger the error reporter — decide whether to keep.
- Export emits root-relative URLs (`/_expo/...`, `/manifest.json`, `/icons/...`, `/sw.js`, Workbox `navigateFallback: '/index.html'`, manifest `start_url`/`scope: '/'`). All must move under the Pages subpath.
- Native identities default to `me.bilt.wealthline` (env-overridable). Leave unchanged until reviewed with the owner.
- `package.json` name is still `bilt-starter`; README is the Bilt template.

## Phase 1 — Backend access and functional audit (Opus)

Blocked on owner input: `EXPO_PUBLIC_BILT_URL` and `EXPO_PUBLIC_BILT_ANON_KEY` from the Bilt project.

1. Put values in `.env.local`; `npx expo start --web`.
2. Exercise rankings, people, projects, profiles (all 10 portraits), charts (1D/1M/YTD/All + 3-hour intraday), sign-in, watchlist, admin.
3. Verify watchlist isolation and admin restriction with two separate email identities.
4. Confirm the backend accepts requests from a new origin (CORS) and that the Bilt project will stay alive independently. If not, write up the failure and a migration proposal — no backend changes without owner approval.
5. Record discrepancies with reproduction steps in this file.

## Phase 2 — Design context (Opus + Impeccable)

1. `/impeccable init` → `PRODUCT.md` (audience, purpose, data-honesty constraints from `CLAUDE.md`).
2. `/impeccable document` → `DESIGN.md` from the existing theme (`lib/wealthline-theme.ts`, `global.css`, `wealthline-ui.tsx`). Record owner overrides: Inter, `#FBFBFD`/`#1D1D1F`/`#6E6E73`/`#0071E3`, gain/loss colors with direction glyphs, 20–28px radii, period-ended headings.
3. `/impeccable audit` + `critique` on the current app as the before-state.

## Phase 3 — Slim top-of-hero profile header (Opus designs, Sonnet implements)

Files: `app/person/[slug].tsx`, `components/ProfileHero.tsx`.

1. `/impeccable shape` the header: name + essential identity in a slim band over the top edge of the portrait, beneath existing navigation and safe-area insets.
2. Tinted `expo-blur` frosted glass (already a dependency) with a solid/translucent fallback for web/reduced transparency.
3. Order: hero + header → net worth & change → chart → supporting info/projects. Keep attribution/license access.
4. Verify contrast against all 10 portraits, a long identity label, 320px, large phone, desktop; dynamic type.

## Phase 4 — Native completion (Opus audit, Sonnet fixes)

Blocked on tooling: install Xcode (iOS) and/or Android Studio, or use a physical device with a development build.

- Audit navigation/back, safe areas, chart gestures (`IntradayFortune`, `WealthChart`), keyboard on sign-in/admin, screen-reader labels, 44pt targets, font scaling, reduced motion, loading/empty/error states.
- Check Expo Go compatibility vs. a dev build (`expo-dev-client` is added only when `EXPO_PLATFORM=native`).
- Bump `expo`/`expo-router` patch versions per `expo-check` and re-verify.
- Report browser, simulator, and device results separately.

## Phase 5 — GitHub Pages under a subpath (Opus)

Layout: `/wealthline/` = phone-preview shell, `/wealthline/app/` = Expo app.

1. Use the installed Expo Router’s documented base-path setting (`experiments.baseUrl`, confirm against SDK 57 docs) driven by one env var.
2. SPA recovery: root `404.html` that captures path/query/hash for `/wealthline/app/*` and restores it before routing; no loops; asset 404s stay 404s.
3. PWA: relative manifest URLs, `start_url`/`scope` = app subpath, SW registered at `<base>/sw.js` with app-only scope, Workbox `navigateFallback` + `modifyURLPrefix` for the subpath.
4. Serve the exact artifact locally under `/wealthline/` and test deep links, refresh, query/hash, unknown routes.

## Phase 6 — QR script and phone-preview shell (Sonnet, Opus review)

1. `scripts/preview-qr.mjs` using the `qrcode` package: validates http(s) URL, writes SVG/PNG to `preview-artifacts/`, prints URL + path, optional `--open`, warns on localhost. npm script `preview:qr`.
2. Static shell (`preview/`): ~390×844 iPhone-style frame with iframe of `/app/`, QR, “Open app”, commit SHA. Full-width app on narrow screens; accessible iframe title; no recursive embedding.
3. Run `/impeccable audit` on the shell.

## Phase 7 — GitHub Actions deploy (Sonnet, Opus review)

`.github/workflows/pages.yml`: push to the deploy branch + `workflow_dispatch`; `npm ci`, lint, lint:css, tsc, export with base path, `build:pwa`, assemble shell, generate QR, inject SHA, `upload-pages-artifact`, `deploy-pages`. Least-privilege permissions, concurrency group, public client values from repo **variables**. Scan output for secrets.

Owner tasks: enable Pages (source: GitHub Actions). **Pages on a private repo requires a paid GitHub plan**; otherwise the repo must be made public. Add the two `EXPO_PUBLIC_BILT_*` values as Actions variables.

## Phase 8 — Data activation (owner operations; Opus assists)

Admin designation, verified holdings/other-asset calibration, market updater logs, secure market-hours scheduler (~15 min), ranks 11–20 only from supplied/verified sources. Never fabricate.

## Phase 9 — Docs and handover (Sonnet, Opus review)

Rewrite README (local web, native, QR, deploy, remaining setup); rename `package.json` from `bilt-starter`; final report with preview + direct URLs and separated browser/native/device results.
