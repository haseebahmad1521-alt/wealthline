# Wealthline — plan and status

From-scratch rebuild of Wealthline, now on `main`. The original prototype (built on the Bilt platform) is archived at tag `archive/bilt-final`; nothing in the app depends on Bilt.
Requirements: `CLAUDE.md`, `HANDOFF.md`, `PRODUCT.md`. Backend setup: `supabase/README.md`.

**Live:** shell https://haseebahmad1521-alt.github.io/wealthline/ · app https://haseebahmad1521-alt.github.io/wealthline/app/
(auto-deploys on every push to `main`).

## Current state (for a fresh session — read this first)

- Branch `main` (default; `rebuild` was merged into it on Nov 1, 2026). Repo public; GitHub Pages deploys every push to `main` (check with `gh run list --workflow pages.yml`).
- Backend: Supabase project ref `qucpeyrbzyfqtmxhmezr`; public client values in `.env` (git-ignored). Supabase CLI is logged in: `npx supabase@latest db query --linked --project-ref qucpeyrbzyfqtmxhmezr "<sql>"`, `functions deploy <name> --project-ref … --use-api`, `config push --project-ref …` (auth settings live in `supabase/config.toml`).
- Edge Functions deployed: `sign-in`, `verify-device`, `activate`, `daily-brief`, `refresh`, `refresh-due` (no JWT; cron secret). Migrations applied: init, device_auth, briefs, saved_views, refresh, refresh_cron (pg_cron every 10 min). See `supabase/README.md` "Live refresh".
- Auth reality: built-in Supabase email sender only (rate-limited, ~2 emails/hour, can't show the 6-digit code). Owner signed up and activated on Oct 24 (1 verified session). Activation link signs you in and trusts the device (first sign-in, ≤15 min). New devices: the sign-in email's link, opened on that same device, verifies it (`activate` function, needs the live challenge + an email-link session); the code works once SMTP + templates are on.
- Design: Impeccable finish review = ship; `DESIGN.md` + `.impeccable/design.json` record the system. Screenshot tooling: Playwright script lives in the session scratchpad (re-create if needed: capture live site at 1440/375/320).
- Standards: Opus leads, Sonnet/Haiku subagents for well-specified work; Impeccable for UI; Ponytail discipline (see CLAUDE.md "Working conventions").
- **Live planet redesign (owner, Nov 1–2, 2026):** see "Resume here" and "Next up" below for status and the work queue. Architecture: `src/components/planet/` (three.js scene + shaders), `src/lib/scene.ts` (shared camera/scroll/chrome state), `src/lib/sun.ts`, `src/lib/texture-tier.ts`, `src/components/world-globe*.tsx`, `src/components/glass*.tsx`, `src/components/ticker.tsx`, `src/components/app-tabs.web.tsx`.
- Previous work (done, deployed): Rankings has one control row (filter button | search | Compare; in narrow compare mode search hides for Confirm + X) and a filter panel with sort + saved views; tagline is "The world's biggest fortunes.". Verified on the live site at 320 and 1440. Nothing is in progress.
- Iterate locally: `npm run preview:phone` serves the phone frame at http://localhost:8090 around the live dev server on :8081 (hot reload; QR for a phone on the same Wi-Fi). Commit as you go; push to `main` (≈2-minute Pages deploy) at batch checkpoints only.
- Domain: wealthline.com is taken (registered 2001). wealthline.io and getwealthline.com looked unregistered (whois, Oct 24 2026). Until a domain is bought, github.io is the home.

## Resume here

_Updated Nov 2, 2026 after the World return fix (commit: see `git log -1`, pushed and deployed)._

- **Just landed (owner's report on "continue"):** coming back to World from a profile no longer breaks the globe. Cause: while a profile covers World, World's globe area measures 0×0 and wrote a zero radius and a 0,0 centre into the shared scene, which put the camera at NaN (blank planet behind the profile) and left every portrait's merge spring at NaN for good (bubbles and fans dead on return). Now the hidden area keeps its last good place, the planet never uses a zero radius, springs restart from each portrait's own place on return, and portraits/dots stay hidden during the camera swing and fade in once it has nearly arrived (`scene.worldMix`), pinned to the planet. Verified in the browser at 390×844: fan open → profile → Back keeps the fan, no NaN, taps and drags work.
- **Earlier (batch A2):** "+N" bubbles fan out at any depth; a portrait tap opens the profile; Back keeps World as it was; no-history Back goes to the last tab (`src/lib/last-tab.ts`).
- **Next:** batch B below (one scene for the remaining views), then P.
- **Half-done:** nothing uncommitted.
- **Ask the owner:** nothing open. (Rocket source decided Nov 2: built in code.)
- **Not verified on a device yet:** globe feel on a real phone (gestures, frame rate), the 8K swap (needs a visible desktop browser for ~10 s), Safari pinch events, tab transition mid-animation, the fan on a 320 px phone.
- **Verify:** `npm run preview:phone` → http://localhost:8090 (phone frame) or http://localhost:8081 directly; `npm run typecheck`, `npm test`; `npm run build:pages` before a push.

## Next up (work queue, priority order)

When the owner writes "continue", take the first unchecked batch, do it, tick it, refresh "Resume here", commit and push.

**Batch A — globe feel, performance, chrome (done Nov 2)**
- [x] Globe: turning never scrolls the page or taps a portrait (touch-action none, drag threshold, cancelled pointer ≠ tap)
- [x] Portraits pinned every frame; spring only on merge/split, stiffer (no jelly)
- [x] Choosing a person flies in close over their HQ; Everyone eases out
- [x] Cheap HDR: night side lifts as the camera gets close
- [x] Performance: sphere LOD (64×48 / 128×96), 32×16 sky, 8×3 atmosphere samples, no per-frame allocations, grid clustering
- [x] Floating rounded glass tab bar with rounded active highlight
- [x] Ticker and tab bar slide/fade away on scroll down, back on scroll up (reduced motion: fade)
- [x] Liquid Glass bevel (light top-left, dark bottom-right) on every glass surface; Rankings panels on Glass
- [x] Dark blurred edge scrims behind the ticker (top) and tab bar (bottom)
- [x] Portraits not clipped at the globe area; fade only at the horizon
- [x] Adaptive texture tiers incl. 8K (`src/lib/texture-tier.ts`)

**Batch A2 — World drill-down and Back (done Nov 2)**
- [x] "+N" bubbles fan out at any depth with a small lean-in; shared-city people reachable
- [x] Tapping a portrait (fanned or single) opens the profile
- [x] Back from a profile returns to where you were; no-history Back goes to the last tab
- [x] Return from a profile: no NaN camera/springs; portraits fade in pinned once the camera arrives

**Batch B — one scene for every view**
- [x] Money / Economies / What if on the real planet: revenue arcs as lines on the globe, country shading as an overlay (replace the SVG globe on web)
- [x] Profiles as a zoom-in: the camera flies to the person's HQ, the profile is glass over the planet, back flies out
- [x] Projects and Watchlist get their own camera poses (one viewframe, every page a different angle)
- [ ] One persistent search field whose context follows the view (people / places / projects / watchlist)
- [ ] News items open as a glass sheet that zooms from the row

**Batch P — Projects: the ascent (owner, Nov 2, 2026; planned, not started)**
The Projects tab becomes a camera pose on a rocket climbing away from Earth. The rocket barely moves; the sense of speed comes from the huge sky and planet behind it.
- Layout: rocket in the bottom-right third, angled up and to the right, exhaust trailing to the bottom right. Content weighted to the top left: a "top 3 projects" glass podium like Rankings, then project news and the latest recorded wealth jumps or drops tied to projects (from existing records only; no invented moves), then the rest of the list below.
- Rocket: low poly (≈2–5k triangles), one texture atlas or flat PBR materials, white body with a dark interstage, grid fins and landing legs folded. Generic, not SpaceX: no logos, flag or name. Source (owner, Nov 2): built in code from a LatheGeometry body plus fins.
- Engine: an additive glowing plume (a cone with a shader, hot white core fading to orange), a soft point light on the hull, and a bloom-like sprite at the nozzle.
- Smoke: white, soft billboard puffs (one instanced mesh, ~60–120 particles) spawned at the nozzle, drifting back and expanding, fading out. Fluffy from a noise-shaded sprite texture, not a photo.
- Speed cues: a few thin diagonal motion lines (screen-space, 3–6 at a time, top-right to bottom-left, low opacity); every 6–12 s a very faint cloud sprite sweeps fast across in front of the rocket.
- Camera: slow floaty drift (two summed sines, a few degrees of orbit and roll) so the rocket parallaxes against the Earth and stars; scroll eases the camera a little higher.
- Reduced motion: still rocket with a steady plume; no motion lines, cloud sweeps or drift.
- Performance: render the rocket in the existing planet scene (no second WebGL context); particles and lines pause when the tab is hidden; check frame time on a mid phone.
- Web first (three.js in `src/components/planet/`); native follows in batch F.

**Batch C — Rankings over the planet**
- [ ] Glass podium: bars fade toward Earth, side bars lean in at the bottom (flat 2D, not 3D)
- [ ] Scroll choreography: sections fade/slide/scale in and out tied to scroll; reduced-motion fallback

**Batch D — legibility and design review**
- [ ] Measure text contrast over the brightest and darkest planet frames (sampled screenshots), adapt tint where needed
- [ ] Impeccable audit → critique → polish → document; refresh DESIGN.md for the dark-glass system
- [ ] Data check: Today's movers shows +876% for Marc Andreessen "since Mar 10, 2026" (baseline looks wrong)

**Batch E — live Earth and assets**
- [ ] NASA GIBS daily cloud layer with its capture date (never presented as real-time)
- [ ] In-app Credits sheet for NASA imagery (texture provenance is in `public/planet/NOTICE.md`)

**Batch F — native**
- [ ] Planet on iOS/Android (expo-gl + three), `expo-glass-effect` on iOS 26, `expo-blur` on Android; development build; simulator and device checks reported separately

## Decisions (owner)

- Web-hosted React Native (Expo SDK 58) app for now; native iOS/Android builds later from the same code. No Expo Go.
- Supabase backend (new project). The original records were exported once from the previous Bilt backend (10 people, 20 dated estimates, 11 holdings, 10 licensed portraits); that export is complete and its script was removed on Nov 1, 2026 (in git history before that date).
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
