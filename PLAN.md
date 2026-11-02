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

_Updated Nov 2, 2026 (late night): batch K backend written and committed, **not deployed** (the auto-mode check refused applying the migration to the live project). **Next: deploy (owner step below), then the chat UI.**_

- **Ask the owner (first thing after "continue"):**
  1. Apply and deploy batch K's backend? The auto-mode permission check blocks production writes from this session, so either allow it or run these yourself (`!` prefix):
     - `npx supabase@latest db query --linked --project-ref qucpeyrbzyfqtmxhmezr "$(cat supabase/migrations/20261102000000_chat.sql)"`
     - `npx supabase@latest functions deploy chat --project-ref qucpeyrbzyfqtmxhmezr --use-api`
     - `npx supabase@latest functions deploy sources --project-ref qucpeyrbzyfqtmxhmezr --use-api --no-verify-jwt`
     - `npx supabase@latest functions deploy refresh refresh-due --project-ref qucpeyrbzyfqtmxhmezr --use-api` (shared `refresh.ts` changed; keep `refresh-due` on `--no-verify-jwt`)
     - Schedule `sources` hourly with pg_cron like `refresh-due` (same Vault `cron_secret`; see `20261025000100_refresh_cron.sql`), and for a first fill call it once per person with `?person=<slug>`.
  2. KTX2 is still blocked on installing KTX-Software (batch S).
- **Just landed (Nov 2, late night):**
  - `e33119f` migration `20261102000000_chat.sql` (additive): `person_posts`, `person_sources` (+ `tsvector` GIN, `search_person_sources()`), `person_personas` (admin read/review), `chat_threads`/`chat_messages` (owner-only reads from a verified session, like the watchlist; writes only by the function), `chat_usage` + `take_chat_message()` (service role only). Checked in PGlite: every migration applies, the cap stops at 20, search ranks. Remote `migration list` shows no history: earlier migrations were applied with `db query`, not `db push`.
  - `81700ff` refresh: every fetched post goes into `person_posts` (latest still in `social_posts`); X without `X_BEARER_TOKEN` reads the public embed timeline (`syndication.twitter.com/srv/timeline-profile/screen-name/<h>`, `__NEXT_DATA__` → `props.pageProps.timeline.entries[].content.tweet`) with UA `WealthlineBot/1.0 (+site)`, at most once per 12 h per person; falls back to a self-hosted FxTwitter if `FXTWITTER_URL` is set. The parser is untested against a live page: this Mac still gets 429. After deploy, check `source_health` / `refresh_state.error` for X people.
  - `8a937e6` `sources` function: GDELT `"<name>" interview` (3 months) → fetch article → Claude Opus 5.5 (low effort, JSON schema) extracts their quoted passages → **stored only if found verbatim** in the article text (`normal()` folds quotes/whitespace/case; tested: exact passes, paraphrase fails). One person per hour by rank, or `?person=slug`.
  - `9cbbcaf` `chat` function: POST `{ person: slug, text }` with the user's token → 401 unless signed in, 403 unless `session_verified()`, 429 after 20/day (UTC). Thread per user+person; history 30; Claude Sonnet 5.5 (effort low, fallbacks default); system = shared rules + per-person material (bio, recorded net worth, persona card if any, 15 posts, 12 headlines, 20 passages) with `cache_control`; `search_sources` tool (strict) up to 3 rounds; reply stored with up to 3 source chips; user message `seen_at` set when the reply starts (✓✓). Type-checked with tsc against the real SDK types; not run (needs deploy + key).
- **Chat UI, how to start:** run `/impeccable shape` first. Route `src/app/chat/[slug].tsx` (or a sheet from the profile); read `chat_messages` via `src/lib/data.tsx` patterns + realtime (`chat_messages` is in the publication); send via `supabase.functions.invoke('chat', { body: { person, text } })`. Show "…" typing while the call runs (reduced motion: static "typing…"), reply appears whole, timestamps, ✓ sent / ✓✓ when `seen_at`, the 429 message as a quiet inline note, AI sparkle beside the name in the header and their bubbles (a11y label "AI simulation"), one-line note at the top, source chips under replies. Add a "Message" entry on profiles. Signed-out / unverified states route to sign-in/verify.
- **Persona cards** (next K item) aren't drafted yet; chat works without them (it reads the sources directly).
- **Data note:** a few `portrait_url`s are SVG logos/coats of arms (e.g. Amancio Ortega, Friedhelm Loh), not portraits. Owner/admin should review; not changed.
- **Default chosen (tell the owner if asked):** the projects podium ranks projects by their builder's rank; switch to announcement date in `podiumProjects` if the owner prefers.
- **Legibility note for batch D:** the brighter rocket sky lowers contrast for secondary text and the inactive filter labels on Projects. Measure and adapt tint there first. Also add a one-line NASA/ESA Gaia/Yale BSC credit (`public/planet/NOTICE.md` promises one).
- **Not verified on a device yet:** World opening smoothness; the rocket's frame time on a mid phone; the keyboard fix and the World drag fix on a real iPhone; plus the earlier list (globe feel, 8K swap, Safari pinch, fan at 320 px, news sheet, profile fly-in).
- **Measuring recipe (batch S):** production build served with `python3 -m http.server` from a folder holding a `wealthline -> pages-dist` symlink, playwright-core driving `chromium_headless_shell` with `--use-angle=metal --enable-gpu`, CPU throttle 4×, `PerformanceObserver({type:'longtask'})`.
- **Checking Edge Functions locally (no Deno here):** copy them to the scratchpad, swap `npm:` specifiers for bare ones, `npm i @anthropic-ai/sdk` there, symlink `@supabase/*` from the project, and run the project's `tsc --noEmit --strict --moduleResolution bundler --allowImportingTsExtensions` with a small `Deno` declaration. Migrations: PGlite (`@electric-sql/pglite`) with stub `auth` schema (`users(id, email)`, `uid()`, `jwt()`), roles and a `supabase_realtime` publication.
- **Half-done:** nothing uncommitted (`.claude/launch.json` is untracked and not ours to commit).
- **Verify:** `npx expo start --web --port 8081`, then `npm run phone:qr -- --plain`, or `npm run preview:phone` → http://localhost:8090. Also `npm run typecheck`, `npm test`, `npm run build:pages` before a push. (Don't run `npx expo lint`: it installs and configures ESLint on its own.)

## Next up (work queue, priority order)

When the owner writes "continue", take the first unchecked batch, do it, tick it, refresh "Resume here", commit and push.

**Batch S — smoothness (owner, Nov 2, 2026): no lag spikes anywhere**
- [x] Portrait thumbnails sized to the display; idle warm-up of World/Projects data and portraits; empires memoized; country shading in idle time; off-thread texture decode
- [x] Stars as points (Nov 2): Yale Bright Star Catalogue (9,096 stars, `public/planet/stars.bin`, 73 KB, built by `scripts/build-stars.mjs`) as one `THREE.Points` (size/brightness from V, colour from B−V, Gaussian in device pixels, ≥2 px so no shimmer), turned by GMST, fading with the same haze/air as the sky (`skyAir` GLSL shared). Milky Way kept as a 2K star-free glow (`milkyway-2k.jpg`, 77 KB, median-filtered from the NASA map). Download 1.6 MB → 150 KB; the 4K star texture (≈32 MB GPU) is gone.
- [ ] Compressed planet textures: KTX2/Basis (`KTX2Loader`, transcoder in a worker) for day/night tiers, cutting GPU memory ≈4–8× and the one-frame upload stall when a bigger tier swaps in. Then, if 8K is still worth it, stream it as tiles (only tiles in view, uploaded a few per frame) for close World zoom. **Blocked (Nov 2):** no encoder on this Mac (no Homebrew); running the unpacked KhronosGroup KTX-Software 4.4.2 `ktx` binary from the scratchpad was refused by the auto-mode permission check. Owner: install KTX-Software (`KTX-Software-4.4.2-Darwin-arm64.pkg` from its GitHub releases) or allow running it, then `ktx create --encode uastc`/`basis-lz` the day/night tiers; three's transcoder is already in `node_modules/three/examples/jsm/libs/basis/`.
- [x] Measure (Nov 2): long tasks over 50 ms, production build, headless Chromium on Metal (M4) at 4× CPU throttle (≈ a mid phone). No throttle: none during any interaction. 4×: cold start 8 (max 345), World open 3 (max 133), first Projects open 202 (≈146 React mount + ≈47 first frame; rocket shaders now precompiled in idle via `compileAsync`, which halved the WebGL part in dev), Rankings 62, profile 0, Back 124. Public React Query cache (people, world, projects, brief, fx) now persists to localStorage (≈540 KB) and restores before the first render; private queries are never saved.
- [ ] Cut first-visit mount cost (Projects ≈146 ms React at 4×), Back to Rankings (124 ms) and the 345 ms cold-start task. **Tried and reverted (Nov 2):** pre-mounting hidden tabs in idle: expo-router/ui's `TabSlot` only has a route in `state.routes` once it has been visited (only `index` at start), so there's nothing to pre-render; rendering screens outside the navigator would mount a second copy. Next idea: profile the Projects tree (React DevTools profiler or CDP `Profiler.start` on the dev build, script pattern in Resume here) and defer below-the-fold sections (e.g. render the podium first, the lists in the next idle frame), or navigate to each tab once at startup behind the splash (needs owner OK: it would touch history).

**Batch K — Chat with a billionaire (owner, Nov 2, 2026: "the big selling point")**
A messaging screen per person: our messages on the right, theirs on the left, an animated "…" while they type, the whole reply shown only when ready, timestamps, simulated ✓✓ seen. Replies come from Claude (server side, `chat` Edge Function) speaking in a persona built from what is publicly known about the person and how they talk, driven by recent news and posts, able to pull older material when relevant.
- Research (Nov 2):
  - Already in place: `people.social` (one main account each; of 100: X 21, Instagram 6, LinkedIn 2, Facebook 1, none 70), `social_posts` (latest post only), `person_news` (30 days, Google News/GDELT/HN/outlet RSS), Claude in `daily-brief`/`project-scout`.
  - Free official reads: Bluesky (`public.api.bsky.app`, wired), Mastodon (`/api/v1/accounts/:id/statuses`), YouTube channel RSS (`youtube.com/feeds/videos.xml?channel_id=`), blogs and letters by RSS (e.g. GatesNotes, Berkshire letters), Telegram public channels.
  - X: official API with `X_BEARER_TOKEN` (wired; paid). Open-source no-key readers ([twscrape](https://github.com/vladkens/twscrape), [Scweet](https://github.com/Altimis/Scweet), [x-reader](https://github.com/DjinnFoundry/x-reader)) call X's internal GraphQL with logged-in accounts: against X's terms, accounts get banned, breaks often. Not recommended for a product.
  - [RSSHub](https://github.com/DIYgod/RSSHub) (AGPL-3.0, 46k★, active): one self-hosted service with routes for Instagram, Bluesky, Facebook, YouTube, Telegram and many more; its X route also needs a logged-in cookie (same problem). [RSS-Bridge](https://github.com/RSS-Bridge/rss-bridge) (PHP, 400+ bridges) is the alternative. Either runs as its own container, outside Supabase; the AGPL only binds that service, not our app.
  - Instagram/LinkedIn/Threads/Facebook: no official API for other people's posts; scraping is against their terms.
  - 70 of 100 have no social account: their persona has to come from interviews, shareholder letters, books, speeches and news (with links).
- Plan:
  - [x] Data (Nov 2, not yet deployed): `person_posts` (many posts per person, not just the latest; text copied, link kept) and `person_sources` (quotes/excerpts from interviews, letters, speeches with URL and date), Postgres full-text search for older material (pgvector + Supabase's built-in `gte-small` embeddings later if search is weak)
  - [ ] Persona card per person (voice, topics, catchphrases, stances, each line with a source), drafted by Claude from the sources, stored, admin-reviewable
  - [x] `chat` Edge Function (Nov 2, not yet deployed): signed-in users only, per-user rate limit and daily cap, Claude Sonnet 5.5 with prompt caching (persona + recent posts/news cached), a search tool over older sources; never invents numbers (net worth from our records only), declines defamatory, medical and investment-advice content; key stays on the server
  - [ ] Chat UI (Liquid Glass over the planet): bubbles right/left, "…" typing (reduced motion: static "typing…"), reply appears whole, timestamps, ✓ sent / ✓✓ seen, "Message" entry on profiles, chat history per user (RLS: private)
  - [ ] Honesty: AI sparkle icon beside the name (header + bubbles, a11y label "AI simulation"), one-line note at the top of each chat; replies can show "based on" source chips
- **Owner answers (Nov 2):** (1) X must be free → plan: X's public embed endpoints first (`syndication.twitter.com/srv/timeline-profile/screen-name/<handle>`, used by embedded timelines on news sites; no login, but it returned 429 on a Nov 2 probe, so poll rarely and cache; `cdn.syndication.twimg.com/tweet-result?id=` works for single posts), then a self-hosted [FxTwitter](https://github.com/FixTweet/FxTwitter) (MIT, Cloudflare Worker free tier, `/2/profile/<handle>/statuses`; its public instance gave 404 on Nov 2). Both use X's guest/internal web API: free, but no logged-in account, may break, and X could object. Headlines quoting posts (already in `person_news`) cover the rest. **Owner decision (Nov 2):** use X's internal web API with an honest, named User-Agent (e.g. `WealthlineBot/1.0 (+site URL)`), rarely, spread out under the rate limit, and cache every post so the archive builds up for everyone over time. Weight sources: recent news about them, and above all interviews in their own words. (2) Signed-in users, 20 messages a day. (3) Disclosure (owner, Nov 2): an AI sparkle icon next to the person's name in the chat (header and their bubbles), with the accessible label "AI simulation" for screen readers, plus the one-line note at the top of each chat. With those in place chat opens to all signed-in users; no admin-only gate needed. Shareable screenshots keep the sparkle beside the name.

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
- [x] One persistent search field whose context follows the view (people / places / projects / watchlist)
- [x] News items open as a glass sheet that zooms from the row
- [x] Glass frosts the globe portraits (they no longer draw over UI)
- [x] Opened bubbles: bigger portraits, sized by net worth

**Batch P — Projects: the ascent (owner, Nov 2, 2026)**
- [x] Rocket, plume, bloom, hull light, smoke, motion lines, cloud sweeps, floaty camera, scroll climbs, reduced motion, same WebGL context
- [x] Content layout: top-3 podium, project news, builders' wealth moves (fills in once projects are recorded)
- [x] Rocket view at the edge of space: low skimming camera, blue air fading to stars, slow planet spin, rocket held in frame with a slight wander (owner, Nov 2)
- [ ] Frame time on a mid phone
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
- [x] Glass clears as you scroll faster (owner, Nov 2)
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

- **Target is iOS (owner, Nov 2, 2026):** iPhone, and iPad (landscape at worst). Desktop browser layouts no longer need design attention; the web build stays as the preview and the base for the native app.
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
