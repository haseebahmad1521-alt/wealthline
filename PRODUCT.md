# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Casual-first general audience who enjoy following the world's largest fortunes the way they'd check scores, with finance-literate followers (investors, market watchers) served by depth one tap away: holdings, sources, methodology, value history.

## Product Purpose

Wealthline tracks the world's biggest personal fortunes over time: a ranking, rich individual profiles, value history and a three-hour intraday view, a feed of what these people are building, and a private personal watchlist. Success is a visitor understanding at a glance who is where and how they are moving, and trusting it because every number shows where it came from.

## Positioning

- **Honest live movement.** Values move with markets, and the app always says whether a number is observed, interpolated, projected, or stale. Smooth animation is never presented as market data.
- **Editorial profiles.** Photographic, modern, slightly playful profiles rather than spreadsheet rows.
- **Projects feed.** Sourced announcements of what these people are building.
- **Personal watchlist.** Private favorites and saved views tied to a user account.

## Operating Context

- One product on iOS, Android, and web (desktop + mobile web, installable PWA), each following its own platform conventions.
- Web preview published to GitHub Pages inside an iPhone-style presentation shell; native preview via Expo Go on a physical phone.
- Admins (owner-designated accounts) maintain people, dated estimates, holdings, projects, and events.

## Capabilities and Constraints

- Rankings, people directory, profiles, history chart with a default three-hour intraday window and smooth zoom/pan from seconds to all-time, projects feed, watchlist, protected admin.
- Saved views: a signed-in user can save a list view (filter + sort, e.g. "Tech founders, sorted by 1-day change" or "Projects: upcoming only") to their account, private like the watchlist, one tap away.
- Currency: values are stored and sourced in USD (the default). Users may switch display currency; conversion uses a keyless public reference-rate API (e.g. Frankfurter / ECB daily rates), and a converted figure shows its rate and rate date. Daily rates never make a value look fresher than its source.
- Language: English only for now.
- Accounts: email + strong password sign-up with a verification/activation link in a professionally styled email; email one-time code as a second step when signing in on a new device. Google and Apple sign-in are planned for store publication, not now.
- Backend: Supabase (Postgres + row-level security). Public data world-readable; writes admin-only; watchlists private per user.
- Target is 20 people; only ten owner-supplied October 1, 2026 estimates exist. Ranks 11–20 stay empty until sourced.
- Never generate random fluctuations; projections only from sufficiently recent observations, clearly marked; stale estimates never shown as live; reduced-motion respected.
- Undecided: market-data provider activation and scheduler; production email sender; native store identities.

## Brand Commitments

- Name: Wealthline. Tagline in use: "The world's biggest fortunes. In motion."
- Owner-pinned visual constraints (CLAUDE.md "Visual direction"): Inter; background #FBFBFD, white surfaces, 20–28px radii; text #1D1D1F / #6E6E73; action #0071E3; gains #1E7B45 and losses #B42318 always with a direction glyph; soft shadows; tightly tracked display headings; ~1120px desktop width; section headings end in a period; minimal Apple-style foundation with a bolder photographic editorial profile.
- Profile hero (owner revision, Oct 24, 2026): a rounded hero card whose background is the portrait itself, heavily blurred and lightly frosted so each profile takes its photo's colours; the crisp portrait sits on the left with name and identity to its right; no banner over a full-bleed photo. Then net worth and change, chart, supporting info and projects.
- Logo: rising-chart mark, `public/icons/wealthline.svg`.

## Evidence on Hand

- Ten dated estimates, sources, holdings, projects, events, and licensed Wikimedia portraits exist in the previous Bilt backend, pending one-time export. Nothing else may be invented: no testimonials, no fabricated values, history, holdings, or sources.
- Portrait credit and license links must stay accessible wherever a portrait appears.

## Product Principles

1. Provenance over polish: every figure can answer "where did this come from, and how old is it?"
2. Glanceable first, deep on demand.
3. Motion explains change; it never manufactures it.
4. Private by default: a person's watchlist is theirs alone.
5. Native on every platform rather than one look forced everywhere.

## Accessibility & Inclusion

Standard: WCAG 2.2 AA on web, plus VoiceOver and TalkBack support on native. Direction never conveyed by color alone; screen-reader labels on values and changes; 44pt/48dp touch targets; dynamic type and font scaling; reduced motion; layouts from 320px phones to desktop.
