# 0013 — Visual identity: the Margin direction, its tokens, fonts and chart rules

**Status:** Accepted · **Date:** 2026-09-19

## Context
The web app uses a neutral shadcn placeholder theme (kickoff decision #10) and system fonts. Before
building more screens we need a real identity, on the DegRon palette: greys #4B5563 (structure),
#374151 (text), #E5E7EB (backgrounds, dividers), orange #F97316 (progress and action) and
#FB923C. Constraints: an encouraging-mentor personality (confident, warm, honest, never hype);
early-career candidates on mid-range Android phones and costly data; WCAG AA; 360 px first; at most
two self-hosted font families; the signature moment is the readiness score rising.

Three directions were explored as static mockups (Route, Margin, Blocks) on the reference branch
`design/explorations` (commit `0b976e2`: pages, screenshots at 360 and 1280 px in light and dark,
contrast tables, and the scripts that build them). That branch is not merged; it is the visual
reference for this ADR. The owner chose **Margin**, with adjustments that are applied there.

## Decision
**Direction.** Margin: the product speaks like a mentor annotating your work. A reading column
with a margin for the mentor's notes (on phones the notes follow their paragraph); quoted phrases
from the candidate's answer are highlighted and numbered, and the notes answer them. DegRon grey
#4B5563 carries the structure: the navigation bar and phone tab bar, frames, section rules and the
rails beside notes. Backgrounds are white or cool light grey (#F3F4F6), never cream. Readi is its
own identity; "Readi by DegRon" appears as a line of text in the footer and on legal and billing
pages. Wordmark: "Readi" in Alegreya Medium with the dot of the i replaced by an orange pen tick
(typographic: a dotless ı plus a small SVG).

**Type.** Alegreya (serif) only for headings and the mentor's notes, at one weight (500). Alegreya
Sans 400 and 700 for buttons, forms, body text, candidates' quoted answers and every number.
`font-synthesis-weight: none`, so a bold class can never produce fake bold serif. Fonts are
self-hosted (next/font/local), `font-display: swap`, and only Alegreya Sans 400 is preloaded.

**Font budget: 60 KB on first visit (measured 55.8 KB).** Each file is cut to the characters we
use (Basic Latin, Latin-1, U+0131 for the wordmark, dashes, curly quotes, bullet, ellipsis) with the
layout features we need (kern, ligatures, numeral styles, case): Alegreya 500 18.9 KB, Alegreya
Sans 400 18.3 KB, 700 18.5 KB. The files are built by a checked-in script from the Fontsource 5.3.0
packages with fonttools (ported from `design/explorations/tools/trim-fonts.sh`); OFL licences ship
with them.

**The naira sign.** None of the candidate fonts has ₦ (U+20A6) in its standard Latin file; it is only
in latin-ext. Rather than ship latin-ext, each family gets a separate ₦-only face (0.9–2.5 KB)
declared with `unicode-range: U+20A6` and listed after the main face in the font stack, so browsers
download it only on pages that show ₦ (verified in the mockups: it loads on the one page with a
price-like string and nowhere else).

**Colour tokens** (shadcn names, plus Readi additions; dark mode via `prefers-color-scheme`):

| Token | Light | Dark |
|---|---|---|
| `--background` / `--foreground` | #FFFFFF / #374151 (10.31:1) | #111827 / #E5E7EB (14.33:1) |
| `--heading` | #374151 | #F9FAFB |
| `--card` / `--card-foreground` | #FFFFFF / #374151 | #1F2937 / #E5E7EB (11.86:1) |
| `--muted` / `--muted-foreground` | #F3F4F6 / #4B5563 (6.87:1) | #1F2937 / #9CA3AF (5.78:1) |
| `--primary` / `--primary-foreground` | #C2410C / #FFFFFF (5.18:1) | #FB923C / #111827 (7.84:1) |
| `--primary-hover` | #9A3412 (7.31:1) | #FDBA74 (10.52:1) |
| `--secondary` / `--secondary-foreground` | #F3F4F6 / #374151 | #1F2937 / #E5E7EB |
| `--accent` / `--accent-foreground` | #FFF7ED / #374151 | #2A1D14 / #FED7AA |
| `--destructive` / `--success` | #B91C1C (6.47:1) / #15803D (5.02:1) | #F87171 / #4ADE80 |
| `--border` (decorative dividers) | #E5E7EB | #374151 |
| `--input` (form field borders) | #6B7280 (4.83:1) | #6B7280 (3.67:1) |
| `--ring` | #C2410C (5.18:1) | #FB923C (7.84:1) |
| `--chart-1` (lines, progress marks) | #C2410C | #FB923C |
| `--pen` (note markers, annotation rings) | #EA580C (3.56:1) | #FB923C |
| `--highlight` (quoted phrases) | #FFEDD5 (text 9.00:1) | #4A2511 (text 10.85:1) |
| `--progress` / `--track` (meters) | #EA580C / #E5E7EB | #FB923C / #374151 |
| `--frame` (frames, rules, rails) | #4B5563 (7.56:1) | #6B7280 (3.67:1) |
| `--nav` / `--nav-foreground` / `--nav-muted` | #4B5563 / #FFFFFF (7.56:1) / #E5E7EB (6.10:1) | #1F2937 / #F9FAFB / #9CA3AF (5.78:1) |
| `--nav-accent` (current page, wordmark tick) | #FB923C (3.34:1 on the bar) | #FB923C |
| `--brand` (decoration only) | #F97316 | #F97316 |
| `--radius` | 0.25rem | |

Ratios are against the page background unless stated; every text pair clears 4.5:1 and every
meaningful graphic 3:1 in both themes. Rules that follow from them:
- **Buttons:** #C2410C with white text in light mode; #FB923C with #111827 text in dark mode.
  White text is never set on #F97316 (2.8:1).
- **#F97316 is never the only sign of anything** on a light background (2.8:1): progress uses
  #EA580C or #C2410C, and every progress mark also has a number or label.
- **Form fields use `--input` (#6B7280).** shadcn's neutral default (#E5E5E5, 1.26:1) fails the
  3:1 non-text contrast rule; the light grey stays for decorative dividers only.
- **Focus** is a 2 px `--ring` outline with a 2 px offset on every interactive element.

**Button sizes.** Add `size="lg"` (48 px tall), the upstream shadcn variant name, for hero and
primary page actions; `default` stays 44 px and `sm` 36 px.

**Charts: plain SVG, no chart library.** The readiness trend and similar charts are server-rendered
SVG, not shadcn Chart (which would add Recharts to candidate pages). Geometry is in percentages and
labels are sized in CSS pixels, so text stays legible at 360 px. A single series has no legend box;
the line is 2 px on a ~10% wash; gridlines are solid hairlines at the band edges (40, 60, 75); labels
use text colours, never the series colour. Every chart has a hover and keyboard-focus readout and a
"See the numbers" table, so no value depends on hovering. Mentor annotations are numbered markers on
points, explained in notes beside the chart.

**Motion.** At most one orchestrated moment per page (on the landing page, the highlighter sweeping
across the quoted phrases), switched off under `prefers-reduced-motion`.

## Consequences
- **Milestone D1 (design system)** implements this on its own branch from `main` after M1 merges:
  replace `packages/ui/src/tokens.css`; add the font files and their build script with a size-budget
  check; Button `lg`; the Note, Highlight, navigation bar and tab bar components; the SVG chart
  pattern; restyle the M1 screens; check at 360 px and Slow 4G; update CLAUDE.md conventions.
- Until D1 the app keeps the neutral theme. M1 phases 4–5 are built on it and restyled in D1.
- First visits get ~56 KB heavier than today's system fonts (cached afterwards by the PWA).
- Copy carries more of the identity: mentor notes must be specific and quote the candidate, so
  empty or generic notes are worse than none.
- Kickoff decision #10 (neutral placeholder) is retired by D1.

## Alternatives considered
- **Route** (the programme as a transit line; Overpass, 38.5 KB): the lightest and clearest, but the
  least warm; the mentor lived only in the copy.
- **Blocks** (readiness as a wall of blocks; Archivo with a width axis): the most striking
  signature, but it read closer to a fitness or game app, and grey buttons stood out less.
- **Near-black text on #F97316 buttons** (6.33:1): passes for text, but the button shape is only
  2.8:1 against white and washes out on dim screens in sunlight.
- **System fonts only** (0 KB): no identity; the serif-annotated mentor voice is the point.
- **Shipping the latin-ext subsets for ₦**, or Google-hosted fonts: more bytes on every page for one
  character, and a third-party request we don't need.
- **shadcn Chart (Recharts):** a charting library on the dashboard for charts that plain SVG draws
  fully, accessibly and with less JavaScript.
