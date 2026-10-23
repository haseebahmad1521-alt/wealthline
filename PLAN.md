# Wealthline — build plan

Plan of record for the from-scratch rebuild (branch `rebuild`) of the former Bilt project. Requirements: `CLAUDE.md`, `HANDOFF.md`, `PRODUCT.md`. The original Bilt code stays on `main` for reference.

Decisions (owner, Oct 24, 2026): build from scratch; new Supabase backend; same repo, new branch; export the existing records from Bilt once; email + strong password sign-up with a verification link, emailed code as second step on new devices, Google/Apple later; platform conventions per OS; native preview through Expo Go on the owner's phone (no Xcode: disk space).

## Done

- [x] Expo SDK 58 scaffold (React 19.3, RN 0.88, Expo Router, React Compiler), brand icons kept.
- [x] Supabase schema with provenance on every value (`estimate` / `computed`, source), RLS: public read, admin-only writes, private watchlists.
- [x] Device-verified auth: `sign-in` / `verify-device` Edge Functions; database only trusts sessions they issued (`session_verified()`), so a bare password or bare OTP session cannot touch private data. Branded email templates.
- [x] Honest live logic (`src/lib/live.ts`): observed / projected (≤15 min, from recent observed trend) / stale / none; no randomness. Unit-tested.
- [x] Screens: Rankings, People, Projects, Watchlist, Profile (slim frosted identity band over the portrait hero, live value + provenance chip, pan/zoom chart 30 s → all time), Account, Admin, Not found.
- [x] Native tabs on iOS/Android; web top nav on desktop, bottom tabs on phones.
- [x] GitHub Pages pipeline: subpath export, PWA, 404 route recovery, iPhone-frame shell with QR + commit id, Actions workflow with secret scan.
- [x] Bilt export script (`npm run import:bilt`), portrait credits recovered from the old source.
- [x] Impeccable: PRODUCT.md, surface brief with direction contract (`.impeccable/surfaces/src-app.md`).

## Verified so far

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | 9/9 pass |
| Web dev server, desktop + 375px | Renders; nav works; "backend not configured" state shown honestly |
| `build:pages` + local Pages server | Shell, app, manifest, sw.js 200; nested route refresh + query/hash restored |
| Real data, auth flows, RLS isolation | **Not yet** — needs the Supabase project |
| Expo Go on a phone | **Not yet** |
| Service worker / install / offline | **Not yet** (built-in browser blocks SW; check in Safari/Chrome) |
| Android | **Not yet** (no emulator; Expo Go on an Android phone works the same way) |

## Next (in order)

1. **Owner:** create the Supabase project, fill `.env`; run both migrations; deploy Edge Functions; set auth settings per `supabase/README.md`.
2. **Owner:** fill `BILT_URL` / `BILT_ANON_KEY`; `npm run import:bilt`; confirm the estimate/computed split; run the SQL.
3. Exercise every screen with real data; two identities for watchlist/admin isolation; designate the admin.
4. Impeccable finish: screenshots per platform, `impeccable-finish-reviewer`, fixes, then `impeccable-documenter` writes DESIGN.md (required by the direction contract's FINISH line).
5. Expo Go on the owner's iPhone: gestures, safe areas, Dynamic Type, VoiceOver, reduced motion.
6. Owner: GitHub Pages enablement (paid plan or public repo) + repository variables; then verify the live URLs and a second deploy's cache update.
7. Market updater (Edge Function + secure scheduler, ~15 min market hours), only after verified holdings and other-asset calibration.
8. Ranks 11–20 only from sourced estimates. Google/Apple sign-in and store identities (`com.haseebahmad.wealthline` is a placeholder for owner review) before publishing.

## Known gaps / decisions open

- Dark mode: owner palette is light-only.
- Production email needs a custom SMTP sender.
- Chart loads full history per person (`shortcut:` comment) — page by window when rows grow.
