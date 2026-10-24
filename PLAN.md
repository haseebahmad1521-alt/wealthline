# Wealthline — plan and status

From-scratch rebuild (branch `rebuild`) of the former Bilt project; the Bilt code stays on `main`.
Requirements: `CLAUDE.md`, `HANDOFF.md`, `PRODUCT.md`. Backend setup: `supabase/README.md`.

**Live:** shell https://haseebahmad1521-alt.github.io/wealthline/ · app https://haseebahmad1521-alt.github.io/wealthline/app/
(auto-deploys on every push to `rebuild`).

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

## Owner tasks (blocking)

1. **SMTP sender** (Supabase → Authentication → SMTP Settings, e.g. Gmail app password). Until then sign-in on a new device cannot complete (the built-in sender can't include the code), so watchlist, saved views and admin can't be used. Then uncomment the templates in `supabase/config.toml` and `npx supabase config push`.
2. **Admin account:** after signing up, `insert into public.admins (user_id) select id from auth.users where email = '…';`
3. **Daily brief:** Anthropic API key + `CRON_SECRET` as Supabase secrets, and a daily Cron job (`supabase/README.md`).
4. **Data:** fix `other_assets_usd` (currently equals each total net worth; would double-count once market data runs); add sourced estimates for ranks 11–20; add projects/events.

## Later

- Market-data updater + secure market-hours scheduler (needs verified holdings first).
- Custom domains; native builds (EAS) with store identities (`com.haseebahmad.wealthline` is a placeholder).
- Dark mode (owner palette is light-only today).
