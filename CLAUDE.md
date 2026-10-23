# Wealthline — project instructions

This file contains the owner's Wealthline requirements for an independent project takeover. It does not contain Bilt's internal instructions. Read `HANDOFF.md` for the implementation plan, current limitations, preview requirements, and acceptance checklist.

## Objective

Take over the actual GitHub repository, preserve its working features and data, finish its cross-platform React Native implementation, and publish an automatically updated GitHub Pages web preview inside an iPhone-style presentation.

**Repository:** `<GITHUB_REPOSITORY_URL>` — the owner must supply this.

Wealthline already uses **React Native, Expo, Expo Router, and React Native Web**. Do not rebuild it as if it were a plain React website. Do not introduce Vite solely to obtain a browser preview. Audit the checked-out repository first; this handoff is a baseline, not a substitute for inspection.

## Product requirements

Preserve:

- Rankings, people directory, projects, and private watchlists.
- Individual profiles with public portrait photography, attribution, and license links.
- Historical wealth charts and the three-hour intraday view.
- Email-code authentication and protected administration.
- Desktop navigation, mobile bottom tabs, and PWA installation.
- Existing records, ownership protections, and backend integration.

The target is 20 people; only ten owner-supplied October 1, 2026 estimates are currently recorded. Do not invent missing net worth, holdings, history, or sources to fill ranks 11–20.

## Visual direction

Preserve the minimal Apple-style foundation and the bolder photographic editorial profile treatment. Do not redesign unrelated screens.

- Inter typography.
- Background `#FBFBFD`; white surfaces with generally 20–28px radii.
- Primary text `#1D1D1F`; secondary text `#6E6E73`.
- Action blue `#0071E3`.
- Gains `#1E7B45`, losses `#B42318`, always with a directional indicator rather than color alone.
- Soft, restrained shadows, generous spacing, tightly tracked display headings.
- Desktop content width around 1120px.
- Preserve established section headings ending in a period.
- Keep profiles modern and slightly playful without making every component larger or heavier.

Use the public Impeccable guidance for accessibility, visual hierarchy, native interaction, and responsive layout: <https://github.com/pbakaus/impeccable>. Inspect its current public documentation rather than assuming file paths or treating it as a requirement to install another framework.

### Required profile-header change

> **Superseded (owner, Oct 24, 2026):** Profile hero (owner revision, Oct 24, 2026): a rounded hero card whose background is the portrait itself, heavily blurred and lightly frosted so each profile takes its photo's colours; the crisp portrait sits on the left with name and identity to its right; no banner over a full-bleed photo. Then net worth and change, chart, supporting info and projects. Full-bleed Wikimedia photos read poorly as heroes; the blur turns any photo into a clean colour field. The original request below is kept for history.

The owner requests the identity header at the **very top of the profile**, with the name and essential identity information in a **slim header over the hero picture**. This is planned, not yet implemented in this handoff.

A lightly tinted frosted-glass treatment may improve readability. Keep the portrait visible, provide a readable translucent/solid fallback, and check contrast against every photograph. Avoid an oversized floating identity card.

“Very top” means the top of profile content beneath necessary existing navigation and native safe-area insets; do not duplicate or remove navigation merely to move the header.

Profile hierarchy:

1. Hero photograph with slim top identity header.
2. Net-worth estimate and change.
3. Interactive chart.
4. Supporting profile information and projects.

Preserve attribution and license access.

## Data integrity and chart behavior

Keep the default three-hour window and smooth zoom/pan from seconds to longer windows. Synchronize fractional displayed estimates and chart movement.

- Never generate random financial fluctuations.
- Distinguish observed values, interpolation, and projections.
- Clearly mark projected segments.
- Never present stale monthly estimates as live market activity.
- Smooth animation is not additional market data.
- Preserve reduced-motion behavior and honest freshness states.

The existing short-term projection feature is based on sufficiently recent observations, not a genuine per-second market feed. Real-data activation still needs verified holdings, other-asset calibration, a secure scheduler, and quote/calculation validation. Do not claim these are complete without evidence.

## Engineering approach

Inspect the existing package scripts, Expo configuration, navigation, theme, backend client, and charts before changing them. Keep changes reviewable and avoid unnecessary rewrites.

Known baseline, to confirm against the clone:

- TypeScript; Expo SDK 57; React Native 0.86; React 19.
- Expo Router and React Native Web.
- HeroUI Native and Uniwind, with existing Inter fonts and theme.
- Recharts on web; native SVG chart implementations.
- Single-page web export and Workbox PWA build scripts.

Keep web-only dependencies isolated in `.web.tsx` files. Use native app UI rather than wrapping the website in a WebView. Reuse the existing shared components and theme.

Audit actual iOS and Android behavior: navigation/back handling, safe areas, chart gestures, keyboard handling, screen-reader labels, touch targets, font scaling, reduced motion, and loading/empty/error states. Verify from 320px-wide phones to desktop.

Report browser, simulator, and physical-device checks separately. An iPhone-shaped browser frame is not proof of native iOS rendering. Use a compatible native development build when Expo Go cannot run the project's native dependencies or SDK.

## Backend and security

Keep the working backend initially if it is accessible from the exported repository. A GitHub deployment does not migrate databases, users, or server-side functions.

Inspect `lib/bilt.ts`, generated database types, auth flows, and deployed-function dependencies. Verify private watchlists and admin restrictions with separate identities. Preserve source provenance and portrait licensing.

If independent hosting requires replacing a dependency, first document the exact problem and propose a migration preserving data, ownership, and authentication. Obtain owner approval before destructive migrations or backend replacement.

Never commit credentials or embed market-data keys, service credentials, admin credentials, or scheduler secrets in a browser bundle. Supply public client configuration separately in local development and deployment. Keep server-side secrets on the backend.

Do not change existing native publish identities as a side effect of web preview work. Review any native release changes separately with the owner.

## Preview requirements

Use Expo's web workflow for the actual app. Add a separate browser presentation shell with an iPhone-style frame, the running app, a script-generated QR code, an “Open app” action, and a deployment commit identifier.

The frame belongs to the preview, not the app. On narrow screens, prioritize a usable full-width app rather than a tiny double-framed phone.

Generate QR images with a real QR library or CLI, never AI image generation. Clearly distinguish web-preview QR codes from Expo native-development QR codes. A QR code does not make localhost reachable from a phone.

In Claude Code Desktop, show/open the generated artifact only through capabilities actually available. If inline display is unsupported, provide the file path/link and open it externally. Do not claim unsupported embedded rendering.

GitHub Pages needs explicit handling of repository subpaths, asset URLs, nested route refreshes, manifest/icons, and service-worker scope. It does not provide general server-side SPA rewrites. See `HANDOFF.md` for the deployment plan.

## Completion report

Provide the published preview and direct app URLs, local/native/QR commands, checks actually performed, and remaining blockers. Separate completed code from operational tasks requiring account access, verified financial data, native devices, or deployment permissions.

## Working conventions (Claude Code)

Added at takeover, October 23, 2026. These apply for the life of the project.

- **Model routing.** Opus 5.5 is the lead model: planning, architecture, design decisions, backend/security, data-integrity work, and final review. Delegate well-specified implementation to Sonnet 5.5 subagents and mechanical work (searches, renames, lint/format fixes, log reading) to Haiku 5.5 subagents. Opus reviews delegated output before it is committed.
- **Impeccable** (`.claude/skills/impeccable`, <https://github.com/pbakaus/impeccable>) is used for all UI work: `/impeccable init` and `document` for context, `shape`/`craft` before building, `audit`/`critique`/`polish` before shipping. Where Impeccable defaults conflict with this file (e.g. it discourages Inter), this file wins.
- **Ponytail** (plugin `ponytail@ponytail`, <https://github.com/DietrichGebert/ponytail>) is the coding discipline: smallest complete change, reuse existing components/deps first, never cut validation, security, accessibility, or data-loss protection. Use `/ponytail-review` on substantial changes.
- **Plan of record:** `PLAN.md`. Update its status checkboxes as phases land.
