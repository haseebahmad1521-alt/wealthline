# Wealthline — takeover and implementation handoff

Prepared October 23, 2026. Read alongside `CLAUDE.md`, which records the owner's product and design requirements.

**Scope of this handoff:** documentation only. The slim profile header, QR tooling, phone-preview shell, and GitHub Pages workflow are future implementation tasks. They have not been built or deployed by creating these files.

## 1. Inputs to collect

Replace these placeholders before deploying:

| Input | Value |
| --- | --- |
| GitHub repository | `<GITHUB_REPOSITORY_URL>` |
| Pages owner | `<GITHUB_USERNAME>` |
| Repository name | `<REPOSITORY_NAME>` |
| Deployment branch | `<DEPLOY_BRANCH>` |
| Pages preview URL | `https://<GITHUB_USERNAME>.github.io/<REPOSITORY_NAME>/` |
| Administrator account | Owner-designated signed-in account |

The repository URL, deployment permissions, and administrator identity were not supplied in this handoff. Do not guess them. No screenshot is included; use the written phone-frame specification unless the owner supplies a visual reference.

Collect configuration and credentials through an appropriate secure mechanism, not committed documentation. Never copy server-side secret values into this file.

## 2. Current baseline

The source is already a genuine React Native/Expo project with a browser implementation, not a plain React app awaiting conversion.

Verified from package/config files during this documentation pass:

- Expo `~57.0.30`, React Native `0.86.3`, React `19.2.3`.
- Expo Router `~57.0.28`; React Native Web `~0.21.2`.
- HeroUI Native, Uniwind, Inter, React Native SVG, and Recharts dependencies.
- `web.bundler: 'metro'`, `web.output: 'single'`.
- Native scheme `wealthline`.
- Node engine `>=20.19.4`; npm `10.9.0` declared.
- `export:web`: `expo export -p web`.
- `build:pwa`: `expo export -p web && workbox generateSW workbox-config.js`.
- `lint`, `lint:css`, `format:check`, and `expo-check` scripts exist.
- Native commands: `npm run ios` and `npm run android`.

Feature status below is the previous implementation record, not a fresh end-to-end audit:

| Area | Recorded state / remaining verification |
| --- | --- |
| Rankings | Ten supplied dated estimates; target 20; do not fabricate the remainder |
| Profiles | Licensed Wikimedia portraits and editorial styling implemented |
| Profile header | Slim top-of-hero identity overlay requested but not implemented |
| Intraday | Three-hour default; zoom/pan and fresh-only projections implemented; fresh-data/native gesture testing remains |
| History | Recharts web and native SVG chart implementations |
| Projects | Filterable feed implemented |
| Watchlists | Email-code sign-in and private watchlists implemented; independently verify access isolation |
| Admin | Protected editing implemented; owner administrator designation outstanding |
| Market updater | Finnhub updater recorded as deployed; confirm deployed source, permissions, and logs separately |
| Financial calibration | Real holdings and other assets still need verification/calibration |
| Scheduling | Secure external market-hours scheduler outstanding |
| PWA | Existing manifest, icons, and Workbox setup; currently needs subpath review for Pages |
| Phone-frame preview / QR / Pages CI | Not implemented in this handoff |

Prior browser/lint checks are not evidence that a new deployment or native build will pass. Re-run appropriate checks on the cloned repository.

## 3. Start from the repository

```sh
git clone <GITHUB_REPOSITORY_URL>
cd <REPOSITORY_NAME>
git switch -c feat/wealthline-takeover
npm ci
npx expo start --web
```

Use the committed lockfile and a Node version compatible with the actual installed dependencies. Inspect installation failures before upgrading packages. Confirm platform SDK availability and native-module compatibility before choosing Expo Go versus a development build.

Read at least:

- `package.json`, lockfile, `app.config.ts`, `tsconfig.json`, Metro/Babel configuration.
- `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, existing routes.
- `app/person/[slug].tsx`, `components/ProfileHero.tsx`, `components/IntradayFortune.tsx`.
- `components/WealthChart.tsx`, `components/WealthChart.web.tsx`.
- `components/wealthline-ui.tsx`, `global.css`, `lib/wealthline-theme.ts`.
- `lib/wealthline.tsx`, `lib/intraday.ts`, `lib/portraits.ts`.
- `lib/bilt.ts`, generated database types, authentication/admin screens.
- `public/index.html`, `public/manifest.json`, icons, `workbox-config.js`, `lib/registerServiceWorker.ts`.

Check any existing repository instructions and reconcile them with these owner requirements. Inspect external service dependencies, including analytics, rather than assuming every integration will work unchanged outside the original environment.

Record a working baseline before edits. Do not alter financial records, change app identities, or migrate the backend just to create a preview.

## 4. Implementation plan

### A. Audit and preserve

1. Confirm framework/dependency versions and available environment configuration.
2. Exercise rankings, directory, profiles, projects, authentication, watchlists, and admin restrictions.
3. Record discrepancies and failures with reproduction steps.
4. Confirm who owns the backend and whether its client SDK and service endpoints remain usable.

### B. Slim top-of-hero profile header

Implement the owner requirement from `CLAUDE.md`:

- Portrait at the top of profile content.
- Name and essential identity in a slim overlay along the upper hero edge.
- Optional lightly tinted blur, with a readable translucent or solid fallback.
- No duplicate navigation, oversized identity card, or unrelated redesign.
- Safe-area support, usable controls, dynamic text sizing, accessible contrast.
- Preserve photo attribution/license access and responsive editorial composition.

Test all ten portraits, at least one long identity label, a 320px viewport, larger phones, and desktop. Check the header in native builds, not only React Native Web.

### C. Finish native behavior

Audit and fix native chart gestures, navigation/back behavior, keyboard handling, safe areas, accessibility, reduced motion, and data states. Preserve web/native chart separation.

Start native development using a compatible setup, for example:

```sh
npx expo start
# Or, after validating the local native build configuration:
npm run ios
npm run android
```

The repository conditionally configures a development-client plugin using `EXPO_PLATFORM`; inspect that condition before building. Document the actual working native commands after testing. Do not promise Expo Go compatibility without checking it.

### D. Activate accurate data separately

- Designate the owner's administrator account.
- Enter verified holdings and calibrate other assets without double-counting.
- Validate quote timestamps, conversions, and net-worth calculations.
- Inspect the actual deployed market updater and its invocation logs.
- Connect a secured external scheduler; approximately 15 minutes during market hours is the existing intended cadence, to confirm with the owner.
- Verify market calendar/timezone handling, duplicate runs, rate limits, stale quotes, and failures.
- Add sourced records for ranks 11–20 only when supplied or verified.

Do not treat smooth interpolation as true per-second observations. If a genuine higher-frequency feed is requested, propose provider coverage, licensing, cost, and backend requirements separately.

### E. Script-generated QR artifacts

Add a real QR library/CLI and a small repeatable script. Proposed commands, **not currently existing scripts**:

```sh
npm run preview:web
npm run preview:qr -- --url https://<GITHUB_USERNAME>.github.io/<REPOSITORY_NAME>/
npm run preview:qr -- --url http://<REACHABLE_LAN_IP>:<PORT>/ --open
```

Choose script names consistent with the repository. The script should:

1. Accept and validate an explicit `http://` or `https://` URL.
2. Generate a PNG or SVG using a QR encoder, not AI imagery.
3. Write to a documented generated-artifact location.
4. Print the encoded URL and artifact path.
5. Optionally open the image using the host OS; absence of an opener must not corrupt generation.
6. Warn when a localhost URL is being shared to another device.

A QR code for the public web preview opens a browser. Expo's native-development QR opens a compatible development app. Keep these clearly labeled and do not substitute one for the other.

For local phone access, verify a reachable LAN address or tunnel, firewall settings, and backend connectivity. For Claude Code Desktop, use the available artifact-viewing/opening capability; otherwise show the path and open the image externally. Inline image display is not an assumed capability.

### F. iPhone-style browser preview shell

Build a separate static presentation page around the **real exported app**:

- Desktop: centered iPhone-style bezel, rounded screen clip, subtle camera cutout, QR/controls alongside.
- Use a realistic viewport, e.g. approximately 390 × 844 CSS pixels, and keep the frame proportionate.
- Show a script-generated QR, “Open app” link, and commit identifier.
- Ensure the cutout is presentation-only and does not block in-app controls.
- On narrow screens, provide a usable unframed/full-width app or an obvious direct-app action instead of tiny double framing.
- Give the iframe an accessible title and provide a keyboard-accessible direct-app link.
- Avoid embedding the preview shell recursively.

An iframe is appropriate for this browser-only presentation shell, not as the implementation of the native app. The frame previews React Native Web, not a native iOS runtime.

## 5. GitHub Pages deployment strategy

Recommended URL structure to evaluate:

```text
/<REPOSITORY_NAME>/              preview presentation shell
/<REPOSITORY_NAME>/app/          exported Expo app
/<REPOSITORY_NAME>/app/person/elon-musk   direct profile
```

This is a proposed structure, not configured today. A user/organization root site or custom domain changes the prefix. Define one deployment base path and reuse it in build configuration, wrapper links, QR generation, routing recovery, and PWA configuration.

### Base paths and asset URLs

Consult the current Expo Router documentation for the installed version's supported base-path mechanism before editing. Do not guess a configuration property or patch only HTML while leaving router and asset URLs inconsistent.

Verify JavaScript chunks, styles, fonts, portraits, icons, navigation links, and dynamic routes beneath the selected app prefix. Build and serve the exact deployment layout locally before publishing.

### SPA routing on static hosting

The current export is a single-page app. GitHub Pages does not offer a general server rewrite to `index.html`.

Choose and document one tested solution:

- Retain SPA export and provide a Pages-compatible `404.html` recovery/bootstrap that preserves the original nested path, query, and hash, then restores them under the correct app prefix before routing.
- Or adopt supported static route generation only after confirming every relevant route, including dynamic person profiles, can be generated and refreshed correctly.

If using a 404 recovery page, ensure it exists at the **Pages artifact root**, knows which paths belong to the app, avoids redirect loops, and does not intercept asset failures as valid app routes. Document the initial 404-response limitation rather than claiming it is a real server rewrite. If correct HTTP status/SEO behavior is required, consider a static-generation solution or a host with proper rewrites.

Test direct navigation, refresh, shared links with query/hash, and unknown routes. Check both shell and direct-app URLs. Navigation from the homepage alone is insufficient.

### PWA and caching

Inspect the existing root-relative paths before moving the app under a repository/app prefix:

- Manifest URL, `start_url`, `scope`, icon URLs.
- Service-worker registration URL and scope.
- Workbox navigation fallback and precache paths.
- Root document/install metadata.

Scope the app service worker to the app subtree so it cannot return the app in place of the phone shell. Do not manually edit generated Workbox output; fix source configuration and regenerate.

Test a second deployment with changed assets, a previously installed app, offline behavior where supported, and update handling. Clean up any obsolete service-worker registrations in documented recovery steps. Disable the preview's service worker until path/scope correctness is established if necessary; retain the app's PWA feature as a separate completion requirement.

### GitHub Actions

Add a deployment workflow with:

1. Push trigger for the selected deployment branch and `workflow_dispatch`.
2. Checkout, compatible Node setup, npm cache, and `npm ci`.
3. Lint, CSS checks, TypeScript checks, and production export.
4. Preview-shell assembly, correct base-path configuration, deterministic QR generation, and commit metadata.
5. Upload of the complete static Pages artifact.
6. Deployment using GitHub's maintained Pages actions and the `github-pages` environment.

Use least-privilege permissions: source read access for build; Pages write and OIDC token permissions for deployment. Set deployment concurrency so older jobs cannot overwrite newer output. If PR validation is added, it must not deploy untrusted changes or expose privileged credentials.

Supply browser-safe client configuration through deployment configuration. Keep market-data and backend service credentials out of GitHub Pages artifacts. Review the build output for accidental credentials without publishing their values in logs.

GitHub Pages hosts the static browser export only. Backend functions and the market scheduler remain separately hosted. Automatic deployment requires Actions/Pages permissions; finish configuration files and document any manual repository settings if permission is unavailable.

## 6. Backend continuity

The existing client is `lib/bilt.ts`, using `@biltme/backend`. Inspect the actual file and generated types, and retain the working integration initially. A source clone does not include deployed functions, server secrets, database data, or administrator grants by itself.

Required local/CI browser configuration is expected to include:

```text
EXPO_PUBLIC_BILT_URL=<EXISTING_BACKEND_URL>
EXPO_PUBLIC_BILT_ANON_KEY=<PUBLIC_CLIENT_KEY>
```

These are public client values, not admin credentials. Resolve them through the owner's project configuration. `FINNHUB_API_KEY` belongs on the server only and must not gain an `EXPO_PUBLIC_` prefix.

Verify email-code flows on the new origin. Review redirect allowlists only for redirect-based flows actually used; the existing default is code entry, not a magic-link requirement. Verify cross-origin function calls and access isolation from the published site.

If the SDK/service cannot be retained independently, document the concrete failure, propose a migration, and obtain approval before modifying backend ownership, deleting data, or replacing authentication. Preserve schema, policies, sources, users, and identifiers wherever possible.

## 7. Checks and acceptance criteria

Existing commands to run after implementation:

```sh
npm run lint
npm run lint:css
npx tsc --noEmit
npm run expo-check
npm run export:web
# After subpath/PWA configuration is correct:
npm run build:pwa
```

Run formatting checks according to repository conventions. A successful export alone is not a working deployment: serve the exact final artifact, then test the published URLs.

### Product and design

- [ ] Rankings, directory, projects, profiles, watchlists, and admin behavior remain intact.
- [ ] Slim identity header sits at the top of the hero with readable contrast and native safe areas.
- [ ] Photo credits and license links remain accessible.
- [ ] Layout works from 320px-wide phones to desktop.
- [ ] Loading, empty, error/retry, keyboard, accessibility, and reduced-motion behavior are verified where applicable.

### Data and native behavior

- [ ] Default three-hour chart and synchronized estimates remain functional.
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

## 8. Remaining owner/operations tasks

These may remain separate from frontend implementation:

- Supply repository identity and authorize Actions/Pages deployment.
- Supply existing public backend configuration securely.
- Designate the administrator account.
- Provide/verify holdings, other-asset calibration, and sourced estimates for ranks 11–20.
- Authorize and configure secure market-hours scheduling.
- Provide native devices/build access for device verification.
- Supply a phone-preview reference image if exact visual matching is desired.

## Suggested first message to Claude Code

> Read CLAUDE.md and HANDOFF.md in this repository. Inspect the actual implementation and report discrepancies first. Wealthline already uses React Native and Expo: preserve it, implement the slim top-of-hero profile identity header, verify native compatibility, and add a script-generated QR plus an automatically deployed GitHub Pages iPhone-style web preview. Preserve backend/data integrity, fix repository-subpath routing and PWA scope, and report browser/native checks separately. Do not fabricate financial activity, perform destructive migrations, or claim deployment/device verification without evidence.
