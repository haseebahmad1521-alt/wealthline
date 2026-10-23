---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: []
---

# Surface: Wealthline app (all routes)

Scope: the Expo Router app in `src/app` on iOS, Android, and web. Mode: Operate (profiles lean editorial within it). Build path: code-led (Operate). Visual world pinned by the owner brief (CLAUDE.md "Visual direction"); no concept roll.

Audience/job: casual-first followers check who is where and how they are moving; finance-literate users go one tap deeper into holdings and sources.

## Direction contract

THESIS: Every number tells you where it came from. Refuses the category default of an anonymous spreadsheet of totals and a decorative "live" ticker.

OWN-WORLD: Owner-pinned minimal Apple foundation: #FBFBFD ground, white 20–28px surfaces with soft offset shadows, Inter tightly tracked, #1D1D1F / #6E6E73 text, single action blue #0071E3, gain #1E7B45 / loss #B42318 always with a drawn direction icon. Profiles go photographic and bolder: hero coloured by the blurred portrait itself.

STORY: The visitor sees the ranking, opens a person, reads one honest headline value with its provenance chip (Observed · Projected · Estimate as of date), scrubs the chart, and saves the person to a private watchlist.

FIRST VIEWPORT: Rankings: large title "Rankings." then ranked rows (rank, portrait, name, source, value, change). Profile: rounded hero card on the blurred, frosted portrait (each profile's own colour field), crisp portrait tile left, name and identity right, star top-right; below, the headline value with provenance chip, then the interactive chart with 3H default and observed/projected styling.

FORM: Native shells per OS (iOS tab bar + stack; Android Material nav bar; web top nav on desktop, bottom tabs on mobile). Signature move: the provenance chip plus dashed, labeled projection segment. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Open decisions
- Dark mode: owner palette is light-only; dark appearance undecided (iOS/Android refs treat it as first-class).
- iOS refs prefer SF for UI text; owner pins Inter app-wide — owner pin wins.
