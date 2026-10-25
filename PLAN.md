# Wealthline — plan and status

From-scratch rebuild (branch `rebuild`) of the former Bilt project; the Bilt code stays on `main`.
Requirements: `CLAUDE.md`, `HANDOFF.md`, `PRODUCT.md`. Backend setup: `supabase/README.md`.

**Live:** shell https://haseebahmad1521-alt.github.io/wealthline/ · app https://haseebahmad1521-alt.github.io/wealthline/app/
(auto-deploys on every push to `rebuild`).

## Current state (for a fresh session — read this first)

- Branch `rebuild` (default work branch; `main` = old Bilt code). Repo public; GitHub Pages deploys every push to `rebuild` (check with `gh run list --workflow pages.yml`).
- Backend: Supabase project ref `qucpeyrbzyfqtmxhmezr`; public client values in `.env` (git-ignored). Supabase CLI is logged in: `npx supabase@latest db query --linked --project-ref qucpeyrbzyfqtmxhmezr "<sql>"`, `functions deploy <name> --project-ref … --use-api`, `config push --project-ref …` (auth settings live in `supabase/config.toml`).
- Edge Functions deployed: `sign-in`, `verify-device`, `activate`, `daily-brief`, `refresh`, `refresh-due` (no JWT; cron secret). Migrations applied: init, device_auth, briefs, saved_views, refresh, refresh_cron (pg_cron every 10 min). See `supabase/README.md` "Live refresh".
- Auth reality: built-in Supabase email sender only (rate-limited, ~2 emails/hour, can't show the 6-digit code). Owner signed up and activated on Oct 24 (1 verified session). Activation link signs you in and trusts the device (first sign-in, ≤15 min). New devices: the sign-in email's link, opened on that same device, verifies it (`activate` function, needs the live challenge + an email-link session); the code works once SMTP + templates are on.
- Design: Impeccable finish review = ship; `DESIGN.md` + `.impeccable/design.json` record the system. Screenshot tooling: Playwright script lives in the session scratchpad (re-create if needed: capture live site at 1440/375/320).
- Standards: Opus leads, Sonnet/Haiku subagents for well-specified work; Impeccable for UI; Ponytail discipline (see CLAUDE.md "Working conventions").
- Latest work (done, deployed): Rankings has one control row (filter button | search | Compare; in narrow compare mode search hides for Confirm + X) and a filter panel with sort + saved views; tagline is "The world's biggest fortunes.". Verified on the live site at 320 and 1440. Nothing is in progress.
- No localhost: owner verifies on the live github.io site after each push.
- Domain: wealthline.com is taken (registered 2001). wealthline.io and getwealthline.com looked unregistered (whois, Oct 24 2026). Until a domain is bought, github.io is the home.

## Decisions (owner)

- Web-hosted React Native (Expo SDK 58) app for now; native iOS/Android builds later from the same code. No Expo Go.
- Supabase backend (new project); records exported once from Bilt (10 people, 20 dated estimates, 11 holdings, 10 licensed portraits).
- Accounts: email + strong password with activation link; emailed 6-digit code on new devices, enforced server-side. Google/Apple later.
- Later domains: wealthline.com (landing), web.wealthline.com (web version), app.wealthline.com (web app). Hosting moves by changing `EXPO_BASE_URL` / `PAGES_URL`.

## Built

- Rankings (search, Rank/Name/Change, saved views, Compare mode) · Projects · Watchlist · Profile · Compare (≤3, validated palette) · Account (currency, install) · Admin.
- Honest values: estimate/computed provenance, observed/projected/stale/none, no randomness; chart pan/zoom 30 s → all time.
- Optional daily brief (Claude Opus 5.5, server-side, from Google News RSS headlines; links copied from the feed).
- Display currency (ECB rates via Frankfurter, rate + date shown). PWA install, offline cache with update reload.
- RLS: public read, admin-only writes, private watchlists/saved views that require a device-verified session.

## Live data (Oct 25, 2026)

- Opening a profile triggers `refresh` (server decides by staleness tier); values, headlines and the latest post arrive over Realtime with spinners. Finance = Forbes (today + dated history); news = keyless feeds; social = Bluesky, or X with a paid token.
- Top 100 from Forbes real-time list (`supabase/import/forbes-top100.json`, `top100.mjs` → `top100.sql`); social accounts researched once (`social-accounts.json`, Wikidata-based, 30/100 found; verify before relying on them).
- Charts: scrub (hover / one-finger drag) shows recorded, interpolated or projected values; ranges 3H/24H/7D/1M/1Y/All on profile and compare.

## Owner tasks (blocking)

1. **SMTP sender** (optional now, needed before real users): the built-in sender is rate-limited and can't show the 6-digit code, so new-device sign-in uses the link only and must be opened on the same device/browser (an iPhone home-screen app and Safari count as different). Add SMTP (Supabase → Authentication → SMTP Settings), then uncomment the templates in `supabase/config.toml` and `npx supabase config push`.
2. **Admin account:** after signing up, `insert into public.admins (user_id) select id from auth.users where email = '…';`
3. **Daily brief:** Anthropic API key + `CRON_SECRET` as Supabase secrets, and a daily Cron job (`supabase/README.md`).
4. **X API token** (optional): latest X posts need a paid X API bearer token → `npx supabase secrets set X_BEARER_TOKEN=…`. Without it, X shows a profile link.
5. **Data:** fix `other_assets_usd` (currently equals each total net worth; would double-count once market data runs); add sourced estimates for ranks 11–20; add projects/events.

## Later

- Market-data updater + secure market-hours scheduler (needs verified holdings first).
- Custom domains; native builds (EAS) with store identities (`com.haseebahmad.wealthline` is a placeholder).
- Dark mode (owner palette is light-only today).
