import localFont from "next/font/local";

/**
 * The Margin typefaces (ADR-0013). Alegreya (serif, one weight) is the mentor's hand: headings and
 * notes only. Alegreya Sans sets everything else — buttons, forms, body text, the candidate's own
 * quoted words, and every number.
 *
 * The files are trimmed to the characters we use by `tools/trim-fonts.sh`; their OFL licences sit
 * beside them. First visit costs 55.8 KB for the three Latin faces, checked by budget.test.ts.
 *
 * ## Why the naira sign has its own family
 *
 * No Latin subset of these families contains ₦ (U+20A6) — it lives in latin-ext, which would cost
 * every page several KB for one character. So each stack is two families:
 *
 *     font-family: <naira family>, <main family>, <generic>
 *
 * The naira family declares `unicode-range: U+20A6`, so it can only ever match that one character
 * and the browser fetches it only on a page that shows a price. Everything else falls through to
 * the main family. **The naira family must come first.** next/font appends its own metric-adjusted
 * Arial fallback to each family's variable, and that fallback has no unicode-range, so it would
 * swallow ₦ before a later naira family was ever reached. Putting the naira family ahead of it,
 * with `adjustFontFallback: false` so it brings no catch-all of its own, is what makes the order
 * safe. The stacks are composed in globals.css.
 */

/** Headings and the mentor's notes. Not preloaded: interface text matters more on first paint. */
export const alegreya = localFont({
  src: [{ path: "./alegreya-500.woff2", weight: "500", style: "normal" }],
  display: "swap",
  preload: false,
  variable: "--font-alegreya",
});

/**
 * Interface text. Both weights are preloaded: they must share one call to stay one family (or
 * `font-weight: 700` could not select 700), and 700 sets every label and button, so it is fetched
 * on the first paint of every page anyway. ADR-0013 says "only Alegreya Sans 400 is preloaded";
 * this is the one place next/font cannot express it, recorded in docs/progress/2026-09-20-d1.md.
 */
export const alegreyaSans = localFont({
  src: [
    { path: "./alegreya-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./alegreya-sans-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: true,
  variable: "--font-alegreya-sans",
});

export const alegreyaNaira = localFont({
  src: [{ path: "./alegreya-naira-500.woff2", weight: "500", style: "normal" }],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+20A6" }],
  variable: "--font-alegreya-naira",
});

export const alegreyaSansNaira = localFont({
  src: [
    { path: "./alegreya-sans-naira-400.woff2", weight: "400", style: "normal" },
    { path: "./alegreya-sans-naira-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+20A6" }],
  variable: "--font-alegreya-sans-naira",
});

/** Every font variable, for the <html> class. Order here does not matter; the stacks do. */
export const fontVariables = [
  alegreyaSans.variable,
  alegreyaSansNaira.variable,
  alegreya.variable,
  alegreyaNaira.variable,
].join(" ");
