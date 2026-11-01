# Wealthline — architecture and handoff

Read alongside `CLAUDE.md` (owner requirements), `PRODUCT.md`, and `PLAN.md` (current status and owner tasks).

Wealthline is fully independent: its own GitHub repository, its own Supabase project, and GitHub Pages hosting. The original prototype was built on the Bilt platform; it is archived at git tag `archive/bilt-final` and nothing in the current app, build, or backend depends on Bilt. Records from that prototype were exported once into Supabase (Oct 2026) and keep source labels recording where they came from.

## 1. Identity

| Item | Value |
| --- | --- |
| Repository | <https://github.com/haseebahmad1521-alt/wealthline> |
| Default / deploy branch | `main` |
| Pages preview (shell) | <https://haseebahmad1521-alt.github.io/wealthline/> |
| App | <https://haseebahmad1521-alt.github.io/wealthline/app/> |
| Backend | Supabase project (ref in `PLAN.md`) |
| Native identifiers | scheme `wealthline`; `com.haseebahmad.wealthline` (placeholder, review before any store release) |

Collect credentials through a secure mechanism, never committed documentation.

## 2. Stack

- Expo SDK 58, React Native 0.88, React 19, Expo Router (routes in `src/app/`), React Native Web.
- HeroUI Native and Uniwind; Inter; theme in `src/theme.ts` and `src/global.css`.
- Supabase client in `src/lib/supabase.ts`; shared types in `src/lib/types.ts`; data hooks in `src/lib/data.tsx`.
- Web-only code lives in `.web.ts(x)` files (for example `src/components/app-tabs.web.tsx`, `src/lib/session-storage.web.ts`).
- `web.output: 'single'`; base path from `EXPO_BASE_URL` (`app.config.ts`).

## 3. Local development

```sh
npm ci
cp .env.example .env   # fill in the two public Supabase values
npm run web
```

`.env` needs only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. They ship in the browser bundle, so they are public client values; the same values are GitHub repository variables used by the Pages build. Never put a Supabase secret/service key, market-data key, or scheduler secret in `.env` or any `EXPO_PUBLIC_` variable.

Native: no Expo Go. Native work needs a development build (`npx expo run:ios|android` or EAS); report simulator and device checks separately from browser checks.

## 4. Backend (Supabase)

- Schema, RLS, and cron jobs: `supabase/migrations/` (apply in order with the Supabase CLI).
- Edge Functions: `supabase/functions/` (`sign-in`, `verify-device`, `activate`, `daily-brief`, `refresh`, `refresh-due`, `world`, `project-scout`; shared code in `_shared/`).
- Auth settings as code: `supabase/config.toml`; email templates: `supabase/templates/`.
- RLS tests: `supabase/tests/rls.sql`.
- Data import scripts (Forbes list, companies, ownership): `supabase/import/`.
- Full setup and operations: `supabase/README.md`.

Server-side secrets (service role, Anthropic, X token, cron secret, market data) are Supabase secrets only. Obtain owner approval before destructive migrations, data deletion, or replacing a backend dependency.

## 5. GitHub Pages deployment

`.github/workflows/pages.yml` runs on every push to `main` and on manual dispatch: `npm ci`, typecheck, tests, then `npm run build:pages` (`scripts/build-pages.mjs`), which:

1. Exports the app under `/wealthline/app/` (`EXPO_BASE_URL`).
2. Generates the app-scoped Workbox service worker (`workbox-config.cjs`).
3. Assembles the iPhone-frame shell from `preview/` with a script-generated QR (real QR library) for the public URL and the commit id.
4. Adds `404.html` to recover nested routes (the first response is an HTTP 404; Pages has no server rewrites).

The workflow fails the build if the artifact contains server credential patterns. Moving to a custom domain means changing `PAGES_URL` / `EXPO_BASE_URL`.

QR for another URL: `npm run preview:qr -- --url <https-url>` (writes to `preview-artifacts/`). A web-preview QR opens a browser; it is not an Expo native-development QR, and it cannot make localhost reachable from a phone.

## 6. Checks

```sh
npm run typecheck
npm test
npm run build:pages   # exact Pages artifact in pages-dist/
```

A successful build is not a working deployment: test the published URLs after each push.

## 7. Acceptance checklist

### Product and design

- [ ] Rankings, directory, projects, profiles, watchlists, and admin behavior remain intact.
- [ ] Profile hero follows the current owner decision in `CLAUDE.md` with readable contrast and native safe areas.
- [ ] Photo credits and license links remain accessible.
- [ ] Layout works from 320px-wide phones to desktop.
- [ ] Loading, empty, error/retry, keyboard, accessibility, and reduced-motion behavior are verified where applicable.

### Data and native behavior

- [ ] Chart defaults and synchronized estimates remain functional.
- [ ] Observations, interpolation, projections, and staleness are represented honestly.
- [ ] No fabricated financial records or random fluctuations.
- [ ] Web-only dependencies do not enter native bundles.
- [ ] iOS/Android checks are recorded separately from browser checks.
- [ ] Fresh-data projections and native gestures are tested, or clearly left as unresolved.
- [ ] Private watchlists/admin access are tested using different identities. (Oct 24: watchlist/saved-view isolation, unverified sessions, anon and non-admin writes verified with `supabase/tests/rls.sql`; the admin *allowed* path is untested until an admin exists.)

### Preview and hosting

- [ ] Script-generated QR scans to a reachable, correct URL.
- [ ] Shell shows the actual app, not a screenshot.
- [ ] Shell and direct-app links do not recursively embed one another.
- [x] Deployment runs automatically on the selected branch and manually when requested.
- [x] Repository-prefix assets, nested routes, refreshes, query/hash handling, and unknown routes work.
- [x] PWA manifest/service-worker paths and scope are correct.
- [x] Cache/update behavior works across two deployments.
- [x] No server credentials appear in source, logs, or exported browser assets.

### Delivery

- [ ] README explains local web, native development, QR generation, deployment, and remaining setup.
- [ ] Owner receives both published preview and direct-app URLs.
- [ ] Final report lists commands, tests, and operational blockers honestly.

## 8. Owner and operations tasks

Current blocking tasks live in `PLAN.md` ("Owner tasks"). Also:

- Close the old Bilt backend/account once nothing more is needed from it (the app no longer calls it), and revoke its old client key.
- Provide native devices/build access for device verification.
