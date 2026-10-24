---
name: Wealthline
description: The world's biggest fortunes, each number labelled with where it came from.
colors:
  ground: "#FBFBFD"
  surface: "#FFFFFF"
  ink: "#1D1D1F"
  ink-secondary: "#6E6E73"
  hairline: "#E5E5EA"
  fill: "#F2F2F7"
  action-blue: "#0071E3"
  action-wash: "#E8F1FC"
  gain: "#1E7B45"
  gain-wash: "#E8F3EC"
  loss: "#B42318"
  projected: "#6E6E73"
  series-1: "#1F5FBF"
  series-2: "#EB6834"
  series-3: "#0F9D8A"
typography:
  display:
    fontFamily: "Inter, -apple-system, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: "44px"
    letterSpacing: "-1.2px"
  title:
    fontFamily: "Inter, -apple-system, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "32px"
    letterSpacing: "-0.7px"
  section:
    fontFamily: "Inter, -apple-system, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: "28px"
    letterSpacing: "-0.7px"
  headline:
    fontFamily: "Inter, -apple-system, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "22px"
    letterSpacing: "-0.2px"
  body:
    fontFamily: "Inter, -apple-system, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "22px"
  caption:
    fontFamily: "Inter, -apple-system, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
  number:
    fontFamily: "Inter, -apple-system, system-ui, sans-serif"
    fontWeight: 600
    fontFeature: "tnum"
rounded:
  sm: "12px"
  md: "20px"
  lg: "28px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.surface}"
    typography: "{typography.headline}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.action-wash}"
    textColor: "{colors.action-blue}"
    typography: "{typography.headline}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "44px"
  surface-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  provenance-chip:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  provenance-chip-live:
    backgroundColor: "{colors.gain-wash}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  segmented-control:
    backgroundColor: "{colors.fill}"
    rounded: "{rounded.pill}"
    padding: "3px"
  segmented-control-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  input-search:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 0 0 16px"
    height: "44px"
  input-field:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 4px 0 16px"
    height: "48px"
  person-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "10px 16px"
    height: "64px"
  person-row-selected:
    backgroundColor: "{colors.action-wash}"
  rank-badge:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    height: "20px"
  nav-top:
    textColor: "{colors.ink-secondary}"
    height: "56px"
  nav-top-tab-active:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "18px"
    height: "36px"
  nav-bottom-tab-active:
    textColor: "{colors.action-blue}"
---

# Design System: Wealthline

<!-- Documented from the shipped build (src/theme.ts, src/components, public/index.html, .impeccable/review captures), Oct 24, 2026. Owner pins from CLAUDE.md "Visual direction" are marked (pinned). -->

## Overview

**Creative North Star: "The Labelled Ledger"**

A minimal Apple-style foundation, quiet ground, white rounded surfaces, Inter tightly tracked, one action blue, where every headline number carries a small chip saying whether it is observed, projected, or an estimate as of a date. The system is restrained everywhere except profiles, which turn photographic: each profile's hero card is coloured by its own portrait, blurred and frosted into a field.

Density is comfortable rather than sparse: ranked lists sit inside one white card with hairline separators, and generous 24px gaps separate page blocks. Movement is stated, never decorated: gains and losses always pair colour with a drawn triangle, and projections are drawn dashed and labelled in the chart itself.

Open decisions, not yet system rules: dark appearance is undecided (the palette is light-only); native iOS/Android builds come later and will need their own audit of these tokens; the app icon is a temporary Lucide "trending-up" glyph on action blue (provenance in `public/icons/NOTICE.md`).

**Key Characteristics:**
- Light-only ground (#FBFBFD) with white surfaces, soft diffuse shadows, 28px card corners (pinned).
- Inter throughout, negative tracking on display sizes, tabular numerals for every money figure (pinned).
- One action colour; gain/loss green and red only ever beside a direction icon (pinned).
- Provenance chip and dashed, labelled projection segment as the signature move.
- Photographic profile hero: blurred portrait as colour field, crisp portrait tile, identity beside it.

## Colors

A cool near-white neutral world with a single blue voice and two semantic movement colours.

### Primary
- **Action Blue** (pinned): buttons, links, the selected bottom tab, the filled watchlist star, compare checkboxes, focus ring. Its pale **Action Wash** backs secondary buttons and selected compare rows.

### Secondary
- **Gain Green** (pinned): positive change text, the up triangle, upward chart lines, and the live dot in the provenance chip. **Gain Wash** backs the chip when the value is observed or projected.
- **Loss Red** (pinned): negative change text, the down triangle, downward chart lines.

### Tertiary
- **Compare Series** (series-1 blue, series-2 orange, series-3 teal): the only categorical palette, used solely on the compare screen. Validated as a set on the light surface, including colour-vision deficiencies; it holds exactly three series, which is why compare is capped at three people.

### Neutral
- **Ground** (pinned): every screen background; also the base of the translucent navigation bars and the profile frost.
- **Surface** (pinned): cards, lists, the selected segment.
- **Ink** (pinned): primary text, rank badges, all text on the profile hero.
- **Ink Secondary** (pinned): supporting text, captions, inactive tabs, chart axis labels. **Projected** shares this value so projections read as quieter than recorded data.
- **Hairline**: list separators, nav borders, chart gridlines, unchecked checkbox ring, row chevrons.
- **Fill**: input and segmented-control troughs, hover/pressed rows, active top-nav pill, portrait placeholder.

### Named Rules
**The Never Colour Alone Rule.** Gain and loss colour always ride with a drawn triangle (or flat dash) and a spoken direction label. A green or red number without its icon is a defect.

**The One Voice Rule.** Action Blue is the only interactive colour. Movement colours never style controls; series colours never leave the compare screen.

## Typography

**Display Font:** Inter (with -apple-system, system-ui, sans-serif on web)
**Body Font:** Inter
**Label/Mono Font:** Inter with tabular numerals for figures

**Character:** One family carries everything; hierarchy comes from weight and tight negative tracking at large sizes, not from a second face (pinned: Inter app-wide, overriding SF on iOS).

### Hierarchy
- **Display** (700, 40/44px, -1.2px): page titles ("Rankings."). Profile names on desktop scale it up to 56/60px at -1.8px inside the hero only.
- **Title** (700, 28/32px, -0.7px): large figures and sub-page titles; mobile profile names use 24/28px at -0.6px.
- **Section** (700, 22/28px): level-2 headings ("Today's brief.").
- **Headline** (600, 17/22px, -0.2px): row names, button labels, state titles, news titles.
- **Body** (400, 16/22px): running text; centred state copy capped at 420px.
- **Caption** (500, 13/18px): sources, dates, provenance chip, legends. Nav labels use the same 500 weight at 14px (top) and 11px (bottom tabs).
- **Number** (600, tabular): every money and percent figure, sized by context (17px in rows, 11px in rank badges).

### Named Rules
**The Period Rule.** Page and section headings are short statements ending in a period (pinned). Sentence case; no uppercase tracked labels.

**The Tabular Figures Rule.** Any figure that can change or be compared uses tabular numerals so columns and live updates don't jitter.

## Layout

A single centred column, max 1120px content width (pinned), with 16px side padding and 48px bottom padding; page blocks stack with a 24px gap. Spacing runs on a 4px base: 4, 8, 16, 24, 32, 48.

One breakpoint at 900px switches navigation: at and above it, a sticky 56px translucent top bar whose inner width is 1120px plus padding so brand and tabs align with content; below it, a bottom tab bar respecting the safe-area inset. Profile heroes enlarge from an 88px to a 200px portrait at the same breakpoint.

Lists adapt below 520px (compact change shows percent only, 44px portraits) and below 360px (36px portraits, chevron dropped) so 320px phones keep names and values legible. Touch targets are at least 44px (48px on Android) everywhere, including chart zoom buttons and the hero star.

## Elevation & Depth

Hybrid: a single soft, diffuse shadow lifts white surfaces off the ground; everything inside a surface is flat and separated by hairlines or fill tints. Translucency (frosted nav bars, frosted hero) is the second depth device.

### Shadow Vocabulary
- **Ambient Lift** (`0 6px 20px rgba(0,0,0,0.06)`): every Surface card, list container, and the profile hero.
- **Portrait Lift** (`0 6px 20px rgba(0,0,0,0.16)`): the crisp portrait tile inside the hero, so it floats above its own blurred field.
- **Segment Thumb** (`0 1px 4px rgba(0,0,0,0.08)`): the selected option in segmented controls.

### Named Rules
**The One Lift Rule.** Surfaces get Ambient Lift and nothing heavier; no hard offsets, no stacked shadows, no shadow on hover.

**The Frosted Bar Rule.** Navigation chrome is translucent ground (85% top, 94% bottom) with backdrop blur and a hairline edge, never an opaque coloured bar.

## Shapes

Large soft rectangles and pills. Cards and the profile hero use 28px corners; admin groups use 20px (pinned range 20–28px). Every control that is a single action or choice is a full pill: buttons, search, segmented controls, provenance chips, nav pills, rank badges. Form fields on the account screen use a smaller 12px corner. Portraits are circles in lists and rounded squares in the hero (22px mobile, 40px desktop). Content clips to its card corners; separators are inset hairlines, never full-width borders.

## Components

### Buttons
Calm, pill-shaped, and confident.
- **Shape:** full pill, minimum 44px tall (48px Android), 24px horizontal padding, optional 18px leading icon.
- **Primary:** Action Blue fill, white headline label.
- **Secondary:** Action Wash fill, Action Blue label (retry, Compare).
- **States:** pressed drops to 75% opacity; disabled 45%; loading swaps in a spinner in the label colour. Web focus is a 2px Action Blue outline at 2px offset.

### Chips
- **Provenance chip:** Fill pill, caption text in Ink Secondary ("Estimate as of Oct 1, 2026"). When observed or projected it turns Gain Wash with Ink text and a 7px Gain Green dot.

### Cards / Containers
- **Corner Style:** 28px.
- **Background:** Surface on Ground.
- **Shadow Strategy:** Ambient Lift.
- **Border:** none; inner rows separated by inset hairlines.
- **Internal Padding:** 16px for lists, 24px for form cards (max 520px wide).

### Inputs / Fields
- **Search:** Fill pill, 44px tall, 16px body text, no stroke.
- **Form field:** Fill trough with 12px corners, 48px tall, trailing 44px action (e.g. show password).
- **Focus:** global 2px Action Blue outline; selection tinted Action Blue at 18%.

### Segmented Controls
Fill pill trough with 3px inset; the selected option is a Surface pill with Segment Thumb shadow and Ink label, others Ink Secondary. Used for sort, chart range (3H default, 1D, 1M, 1Y, All), and compare modes.

### Navigation
- **Desktop (≥900px):** sticky frosted bar, logo plus "Wealthline" (700, 17px, -0.4px) left; tabs as 36px pills, active on Fill with Ink label, inactive Ink Secondary with Fill on hover; "Sign in"/"Account" as an Action Blue text link.
- **Phone (<900px):** frosted bottom bar, three tabs with 24px icons over 11px labels; active tab Action Blue, others Ink Secondary.

### Person Row
Portrait with the rank as an Ink badge ringed 2px in Surface on the portrait's top-left corner (saves a column, reads on any photo). Name in headline, source in caption, tabular value right-aligned over its Change. Hover/press tints Fill; compare mode turns the row into a checkbox with a 22px circle that fills Action Blue when checked and tints the row Action Wash.

### Profile Hero (signature)
Rounded 28px card whose background is the person's own portrait, blurred (50px mobile, 80px desktop) and frosted with Ground at 62%. Crisp portrait tile left, name and identity ("No. 5 · Google", citizenship) right, all in Ink; watchlist star top-right in a 44px target. Photo credit and licence link sit bottom-right in 12px. The frost guarantees Ink text at roughly 6:1 even over a near-black photo.

### Wealth Chart (signature)
Range segmented control above an SVG plot on a Surface card. Recorded line 2px in Gain/Loss/Ink by trend; estimate points are hollow rings; the projection is a 2px dashed (4 4) Projected-grey segment ending in a hollow point and labelled "Projected" in the plot. Hairline gridlines at quarters, 11px axis labels. A legend (Recorded / Estimate / Projected) and 44px round Fill zoom buttons sit beneath. Empty windows say so and offer "Show all time" instead of filling in values.

## Do's and Don'ts

### Do:
- **Do** pair every gain/loss colour with a drawn triangle or dash and a spoken direction.
- **Do** attach a provenance chip to every headline value and draw projections dashed and labelled.
- **Do** put money and percentages in tabular Inter 600.
- **Do** end page and section headings with a period.
- **Do** keep controls as pills at 44px minimum (48px on Android) and cards at 28px corners with Ambient Lift.
- **Do** derive a profile hero's colour from its own blurred portrait under the 62% frost, and keep the photo credit and licence link visible.
- **Do** cap compare at the three validated series colours.

### Don't:
- **Don't** use green or red as the only signal of direction.
- **Don't** introduce a second interactive colour or use series colours outside compare.
- **Don't** add heavier or hard-offset shadows, or shadows on hover.
- **Don't** add uppercase tracked kickers or eyebrow labels above headings.
- **Don't** animate or fill in values that were not recorded; smooth motion is not market data.
- **Don't** place hero text in white over the photo or drop the frost; Ink on frost is the contrast guarantee.
