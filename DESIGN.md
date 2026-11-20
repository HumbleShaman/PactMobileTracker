---
name: Pact Markets
description: A personal Pact order-flow and revenue tracker, drawn as a transit network on map paper.
colors:
  page: "#f3f3f0"
  panel: "#fcfcfb"
  sunk: "#eae9e4"
  ink: "#0b0b0b"
  ink2: "#52514e"
  muted: "#6b6a65"
  axis: "#77766f"
  hair: "#e1e0d9"
  base: "#c3c2b7"
  band: "#0b0b0b"
  band-ink: "#f6f6f3"
  band-2: "#b4b3ac"
  focus: "#2a78d6"
  up: "#006300"
  down: "#b42318"
  cmp: "#b4b3ac"
  l-hay: "#2a78d6"
  l-nkbd: "#eb6834"
  l-q6ww: "#1baf7a"
  l-rcfx: "#eda100"
  l-deflex: "#e87ba4"
  l-vestige: "#008300"
  l-bots: "#8a8984"
  l-wallets: "#6250d6"
  on-hay: "#ffffff"
  on-nkbd: "#0b0b0b"
  on-q6ww: "#0b0b0b"
  on-rcfx: "#0b0b0b"
  on-deflex: "#0b0b0b"
  on-vestige: "#ffffff"
  on-bots: "#0b0b0b"
  on-wallets: "#ffffff"
  buy: "#2a78d6"
  sell: "#e34948"
  q0: "#eef4fc"
  q1: "#cde2fb"
  q2: "#9ec5f4"
  q3: "#6da7ec"
  q4: "#3987e5"
  q5: "#256abf"
  q6: "#184f95"
  tip-bg: "#0b0b0b"
  tip-ink: "#f6f6f3"
  tip-2: "#b4b3ac"
  page-dark: "#0d0d0d"
  panel-dark: "#1a1a19"
  sunk-dark: "#262624"
  ink-dark: "#f0efec"
  ink2-dark: "#c3c2b7"
  muted-dark: "#a3a29b"
  axis-dark: "#8f8e88"
  hair-dark: "#2c2c2a"
  base-dark: "#3d3d3a"
  band-dark: "#000000"
  band-ink-dark: "#f0efec"
  band-2-dark: "#a3a29b"
  focus-dark: "#3987e5"
  up-dark: "#3fbf3f"
  down-dark: "#ef6b5e"
  cmp-dark: "#5c5b57"
  l-hay-dark: "#3987e5"
  l-nkbd-dark: "#d95926"
  l-q6ww-dark: "#199e70"
  l-rcfx-dark: "#c98500"
  l-deflex-dark: "#d55181"
  l-vestige-dark: "#008300"
  l-bots-dark: "#77766f"
  l-wallets-dark: "#9085e9"
  on-hay-dark: "#0b0b0b"
  on-nkbd-dark: "#0b0b0b"
  on-q6ww-dark: "#0b0b0b"
  on-rcfx-dark: "#0b0b0b"
  on-deflex-dark: "#0b0b0b"
  on-vestige-dark: "#ffffff"
  on-bots-dark: "#ffffff"
  on-wallets-dark: "#0b0b0b"
  buy-dark: "#3987e5"
  sell-dark: "#e66767"
  q0-dark: "#1e2530"
  q1-dark: "#1b3254"
  q2-dark: "#184f95"
  q3-dark: "#256abf"
  q4-dark: "#3987e5"
  q5-dark: "#6da7ec"
  q6-dark: "#b7d3f6"
  tip-bg-dark: "#f0efec"
  tip-ink-dark: "#0b0b0b"
  tip-2-dark: "#52514e"
typography:
  display:
    fontFamily: "'Helvetica Neue', 'Heros', 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "clamp(42px, 11vw, 62px)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "'Helvetica Neue', 'Heros', 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    letterSpacing: "-0.02em"
  figure:
    fontFamily: "'Helvetica Neue', 'Heros', 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Helvetica Neue', 'Heros', 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    letterSpacing: "-0.005em"
  body:
    fontFamily: "'Helvetica Neue', 'Heros', 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  table:
    fontFamily: "'Helvetica Neue', 'Heros', 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    fontFeature: "tnum"
  label:
    fontFamily: "'Helvetica Neue', 'Heros', 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
  axis:
    fontFamily: "'Helvetica Neue', 'Heros', 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    fontFeature: "tnum"
  bullet:
    fontFamily: "'Helvetica Neue', 'Heros', 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "10.5px"
    fontWeight: 700
    lineHeight: 1
rounded:
  bar: "2px"
  tag: "3px"
  control: "4px"
  panel: "6px"
  disc: "50%"
spacing:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "16px"
  tab-gap: "22px"
components:
  band:
    backgroundColor: "{colors.band}"
    textColor: "{colors.band-ink}"
    height: "50px"
    padding: "0 16px"
  tab:
    textColor: "{colors.band-2}"
    typography: "{typography.body}"
    height: "40px"
  tab-selected:
    textColor: "{colors.band-ink}"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "16px"
  seg-control:
    backgroundColor: "{colors.sunk}"
    rounded: "{rounded.panel}"
    padding: "2px"
  seg-button:
    textColor: "{colors.ink2}"
    rounded: "{rounded.control}"
    height: "30px"
    padding: "0 13px"
  seg-button-pressed:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
  search:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    height: "34px"
    width: "200px"
    padding: "0 10px"
  line-bullet:
    backgroundColor: "{colors.l-hay}"
    textColor: "{colors.on-hay}"
    typography: "{typography.bullet}"
    rounded: "{rounded.disc}"
    size: "18px"
  table-header:
    textColor: "{colors.muted}"
    padding: "6px 8px"
  table-cell:
    textColor: "{colors.ink}"
    typography: "{typography.table}"
    padding: "7px 8px"
  tag:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink2}"
    rounded: "{rounded.tag}"
    padding: "1px 6px"
  tooltip:
    backgroundColor: "{colors.tip-bg}"
    textColor: "{colors.tip-ink}"
    rounded: "{rounded.panel}"
    padding: "8px 10px"
    width: "280px"
---

# Design System: Pact Markets

## Overview

**Creative North Star: "The Transit Map"**

Pact's order flow is drawn as a transit network. Every source of swaps (an aggregator, a named arbitrage bot, the other bots, direct wallets) is a coloured line with a lettered bullet, and every pool is a station that lines stop at. The page is a black signage band over map paper: an off-white ground, near-white sheets with hairline edges, and colour reserved almost entirely for the lines. In dark mode the paper becomes graphite and the band goes pure black.

It is a dense, numbers-first operating tool for one fluent reader, checked many times a day on a phone and on a desktop. Type is a single neo-grotesque (Helvetica Neue, or its self-hosted TeX Gyre Heros stand-in) at modest sizes with tabular figures, so the one large figure per view (this month's fees) carries the hierarchy alone. Nothing moves unless the data changed: the only animations are a fading highlight on a fresh swap row, tooltip fades and dimming the lines you are not hovering.

The line palette is the system's spine. It has a fixed order, it reads the same way in every chart, legend, table row and map, and each colour carries its own ink token so the bullet letter clears contrast in both modes.

**Key Characteristics:**
- Black signage band with the title, live status, ALGO price and tabs; underline tabs in band ink.
- Map-paper page, near-white panels, 1px hairlines, 6px corners, no card shadows.
- Eight order-flow lines in a fixed colour order, each with a lettered bullet and its own ink token.
- One neo-grotesque family; tabular figures for every number in tables, axes and stats.
- Charts are flat fills with rounded data-ends; neutrals (ink, cmp) carry Pact's own totals so the line colours stay for actors.

## Colors

Warm-neutral paper and graphite with a saturated, fixed-order line palette; Pact blue appears as the Hay line, the focus ring and the buy side.

### Primary
- **Hay Line Blue** (`l-hay`, dark `l-hay-dark`): the first line (Hay router), and the same blue doubles as the focus ring (`focus`) and the "bought from Pact" side (`buy`). Its sequential ramp (`q0`–`q6`) drives the hour-of-week heatmap, light to dark on paper and dark to light on graphite.

### Secondary (the line palette, in fixed order)
1. **Hay router, H**: Hay Line Blue (`l-hay`), ink `on-hay`.
2. **NKBD arb, N**: Signal Orange (`l-nkbd`), ink `on-nkbd`.
3. **Q6WW arb, Q**: Jade (`l-q6ww`), ink `on-q6ww`.
4. **RCFX bot, R**: Amber (`l-rcfx`), ink `on-rcfx`.
5. **Deflex, D**: Rose (`l-deflex`), ink `on-deflex`.
6. **Vestige, V**: Line Green (`l-vestige`), ink `on-vestige`.
7. **Other bots, B**: Platform Grey (`l-bots`), ink `on-bots`. Also the fallback for any unknown actor.
8. **Wallets, W**: Violet (`l-wallets`), ink `on-wallets`.

Each line has a light and a `-dark` value; the dark set is retuned rather than inverted (Hay lightens, NKBD/Q6WW/RCFX/Deflex deepen, Wallets lightens). The `on-*` tokens are white or near-black per line and per mode, whichever clears contrast on that fill; they flip between modes for Hay, Other bots and Wallets.

### Tertiary
- **Sell Red** (`sell`): "sold into Pact" in the token net-flow chart, paired with `buy`.
- **Gain Green / Loss Red** (`up`, `down`): signed deltas, price change, error border.

### Neutral
- **Map Paper** (`page`): page ground. Graphite `page-dark` in dark mode.
- **Sheet** (`panel`): every panel, the pressed segment, the search field, tooltip stroke gaps around discs.
- **Sunk** (`sunk`): segmented-control track, tags, inline bars' tracks, the fresh-row flash.
- **Ink / Ink 2 / Muted / Axis** (`ink`, `ink2`, `muted`, `axis`): primary text and Pact's own series; secondary text and links; sub-labels and units; chart axis text.
- **Hairline / Baseline** (`hair`, `base`): row dividers, grid lines and panel borders; table header rule, chart baseline and link underline.
- **Comparison** (`cmp`): last month's pace line and the LP side of the fee split.
- **Signage Band** (`band`, `band-ink`, `band-2`): the band's ground, its active text, its inactive text. The band is black in both modes.
- **Tooltip** (`tip-bg`, `tip-ink`, `tip-2`): inverted against the page in each mode.

### Named Rules
**The Fixed Order Rule.** The eight lines always appear in the order Hay, NKBD, Q6WW, RCFX, Deflex, Vestige, Other bots, Wallets, and each actor keeps its colour everywhere. Adjacent pairs were checked for colour-vision deficiency in both modes; do not reorder or substitute.

**The Lines Are Actors Rule.** Line colours mean "who sent the swap" and nothing else. Pact's own totals (fees, TVL, volume, price) are drawn in `ink`, with `cmp` for comparison.

**The Own Ink Rule.** Anything drawn on a line fill uses that line's `on-*` token for the current mode, never a fixed white.

## Typography

**Display Font:** Helvetica Neue (with self-hosted TeX Gyre Heros 400/700 Latin subsets, then Segoe UI, system-ui)
**Body Font:** the same stack
**Label/Mono Font:** the same stack with tabular figures (`font-variant-numeric: tabular-nums`)

**Character:** One signage grotesque throughout, as on a transit map. The Heros subsets only download where Helvetica Neue is missing (`font-display: swap`).

### Hierarchy
- **Display** (700, clamp(42px, 11vw, 62px), line-height 0.95, -0.035em): the month's fee figure, the single hero number on Overview. Its unit is a `small` at 0.45em in `muted`.
- **Headline** (700, 30px, -0.02em): secondary big figures (block rewards ALGO, ALGO/USD price).
- **Figure** (700, 19px; 22px in summary rows, -0.01em): stat values in fact grids, over a 12px `muted` label and a 12px delta.
- **Title** (700, 15px, -0.005em): panel headings; the brand word in the band is 19px 700 -0.02em.
- **Body** (400, 14px, 1.45): base text.
- **Table** (13px, tabular): table cells, segment buttons, live-swap rows; row titles at 600, sub-lines 11.5px `muted`.
- **Label** (600, 12.5px / 12px): panel subtitles and notes (400, `muted`), table headers (600, 12px, `muted`), legends, "show more" actions.
- **Axis** (11px, tabular): chart axes and map sub-labels; map station names are 12.5px 600.
- **Bullet** (700, 10.5px, line-height 1): the letter inside a line bullet.

### Named Rules
**The Tabular Numbers Rule.** Every number in a table, axis, legend value, price or stat uses tabular figures and right-aligns in tables.

**The One Hero Rule.** Only the month's fees use display size; everything else stays at 30px or below.

## Layout

A single centred column, max 1320px with 16px side padding, under a sticky band. Views stack panels with a 16px gap. From 980px, Overview splits into a fluid main column plus a 400px right column (block rewards and live swaps, sticky at 110px); other views use equal halves or a 1.35 : 1 split. Under 560px the band hides the status label, fact grids drop from four columns to two, optional table columns hide and phone-only sub-lines appear, and segment buttons grow to 32px. The flow map switches to its narrow geometry under 640px of panel width.

Spacing rhythm: 16px panel padding and view gaps, 14px under panel headers, 10–14px toolbar gaps, 8px table cell padding (6px on phones), 22px between tabs. Tables scroll sideways inside panels with edge fades showing more content.

## Elevation & Depth

Flat. Panels are separated from the paper by tone and a 1px hairline, not shadow. Two small shadows exist, both functional: the pressed segment lifts slightly off its sunk track, and the floating tooltip sits above the page.

### Shadow Vocabulary
- **Pressed segment** (`box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14)`): the selected button in a segmented control only.
- **Tooltip** (`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28)`): the chart and map tooltip only.

### Named Rules
**The Paper Sheet Rule.** Panels never cast shadows; depth is tone (`page` / `panel` / `sunk`) plus hairlines.

## Shapes

Small, consistent corners: 6px on panels, segmented tracks, search, tooltip and error box; 4px on segment buttons, the theme button and chart data-ends; 3px on tags; 2px on legend swatches, heatmap cells and inline bars. Bars and columns are square at the baseline and rounded (4px) only at the data end. Circles are reserved for line bullets, map stops, the status dot and series end-points; discs drawn over lines get a 2px `panel` stroke so they read as cut out of the paper.

## Components

### Signage Band and Tabs
The band is a sticky black strip (`band`) honouring the top safe-area inset, closed by a 1px hairline. One 50px row holds the brand ("Pact" 19px 700 plus "Markets" 15px `band-2`), a live status (8px dot plus 12.5px label), the ALGO price (13px tabular, bold value, 12px change) and a 32px moon-icon theme button. Below it, a horizontally scrolling tablist: 40px tabs, 14px 600, 22px apart, `band-2` at rest, `band-ink` on hover, and `band-ink` with a 3px `band-ink` underline when selected. The band's status dot and price-change colours are fixed values tuned for the black band, not page tokens.

### Panels
- **Corner Style:** 6px.
- **Background:** `panel` on `page`, with a 1px `hair` border.
- **Shadow Strategy:** none (see Elevation).
- **Internal Padding:** 16px.
- **Header:** title (15px 700) left, a `muted` 12.5px subtitle or a 600 `ink2` action link right, wrapping on narrow widths, 14px above the content. Collapsible "Show as table" details sit under charts.

### Segmented Control
A `sunk` track with 2px padding and 6px corners holding 30px buttons (13px 600, `ink2`, 4px corners, 0 13px). Hover goes to `ink`; the pressed button becomes a `panel` sheet with `ink` text and the pressed-segment shadow. Used for time windows (24h / 7 days / 30 days) and filters. The search field next to it is 34px, `panel` with a `hair` border and 6px corners.

### Tables
Full-width, 13px, collapsed borders. Headers are 12px 600 `muted` over a 1px `base` rule; sortable headers are buttons that turn `ink` when active and show a small CSS triangle for direction. Cells pad 7px 8px with a `hair` divider; first and last columns lose their outer padding; numeric columns right-align with tabular figures. An actor cell leads with a line bullet, then a 600 name and an 11.5px `muted` sub-line. Tags are 11px 600 `ink2` on `sunk`; flag variants are solid `ink` and `ink`-outlined. Inline share bars are 4px `ink` on a `sunk` track.

### Line Bullet (signature)
An 18px disc in the line's colour with the line's single letter (H, N, Q, R, D, V, B, W) in 10.5px 700, coloured with that line's `on-*` ink. It marks the actor wherever it appears: legends, table rows, live swaps, the trunk and the map. In SVG it is drawn at r 9–10 with the same letter and ink.

### Trunk (24h line-share strip)
The day's order flow as one transit line: a 10px-tall bar split into segments per line in fixed order, 2px gaps, rounded only at the two outer ends. Segments 30px or wider carry a bullet (r 9, 2px `panel` stroke) and an 11px share label below. A legend of bullets with names and dollar volume follows. Hovering a segment dims the others to 25%.

### Line-Diagram Map (signature)
The flow map is a vertical transit diagram. Each order-flow source present in the window is a vertical line (6px, round caps) in its colour, headed by its bullet (r 10) and, on wide layouts, its volume. Each pool is a station row (40px; 36px narrow) with its name (12.5px 600 `ink`) and a `muted` sub-line of fee tier, pool type and volume on the left, rows divided by `hair` grid lines; a final "Other pools" row collects the rest. Where a line trades a pool, a stop disc sits on the line with area proportional to volume (radius from 2.5px up to about 15px, 2px `panel` stroke). An interchange bar (2px `ink2` at 45% opacity) joins the outermost lines sharing a station, drawn under the tracks. A line under 1% of volume is drawn thin (3px) at 45% opacity. Each line ends at its last stop. Hovering a line, stop or station dims everything unrelated to 18%; a bullet legend and a "Show as table" fallback sit beneath.

### Live Swaps (departures list)
An ordered list styled as a departures board: a 44px tabular time, the actor's bullet, the pool (600 name, 11.5px `muted` detail) and a right-aligned amount, rows divided by hairlines. New rows flash `sunk` and fade over 2.4s; that is the only arrival motion.

### Tooltip
Fixed, max 280px, 8px 10px, 6px corners, `tip-bg` / `tip-ink`, 12.5px. Bold title; rows pair a 12x2px line key (or 8px dot) with a `tip-2` label and a bold tabular value. Fades in over 0.12s.

## Do's and Don'ts

### Do:
- **Do** draw every actor with its line colour and bullet letter, in the fixed order Hay, NKBD, Q6WW, RCFX, Deflex, Vestige, Other bots, Wallets.
- **Do** colour bullet letters and any text on a line fill with that line's `on-*` token for the current mode.
- **Do** define every new colour in both the light set and the dark set (`:root`, the dark media query and `[data-theme='dark']`).
- **Do** use tabular figures for all numbers and right-align numeric table columns.
- **Do** keep panels flat: `panel` on `page`, 1px `hair` border, 6px corners, 16px padding.
- **Do** round bars and columns only at the data end (4px), square at the baseline.
- **Do** give every chart a table or text fallback ("Show as table") and an accessible label.

### Don't:
- **Don't** use a line colour for anything that is not that actor; Pact's own totals are `ink` and comparisons are `cmp`.
- **Don't** put fixed white text on a fill that changes between modes.
- **Don't** add card shadows; the only shadows are the pressed segment and the tooltip.
- **Don't** add sounds, particles, odometers, banners, toasts or idle animation; motion is for data that changed.
- **Don't** add a second display-size figure to a view.
- **Don't** introduce a second typeface.
