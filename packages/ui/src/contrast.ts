import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * WCAG 2.x contrast for the Margin tokens (ADR-0013). The token file is the single source: this
 * reads the hex values straight out of it, so a theme change cannot drift from its own check.
 */

export type Tokens = Record<string, string>;

const TOKENS_CSS = fileURLToPath(new URL("./tokens.css", import.meta.url));

/** CSS comments hold example colours, so they are removed before anything is parsed. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function declarations(block: string): Tokens {
  const out: Tokens = {};
  for (const match of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
    const [, name, hex] = match;
    if (name && hex) out[name] = hex.toLowerCase();
  }
  return out;
}

/**
 * The light `:root` block, and the dark block layered on top of it — which is how the browser
 * resolves them, so an inherited light value is checked against the dark background it lands on.
 */
export function readThemes(cssPath: string = TOKENS_CSS): { light: Tokens; dark: Tokens } {
  const css = withoutComments(readFileSync(cssPath, "utf8"));
  const lightBlock = /:root\s*\{([^}]*)\}/.exec(css)?.[1];
  const darkBlock = /prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1];
  if (!lightBlock) throw new Error(`no :root block in ${cssPath}`);
  if (!darkBlock) throw new Error(`no prefers-color-scheme: dark block in ${cssPath}`);
  const light = declarations(lightBlock);
  return { light, dark: { ...light, ...declarations(darkBlock) } };
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = channels.map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(foreground: string, background: string): number {
  const [hi, lo] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

export interface Pair {
  /** What the pair is for, in the words the ADR uses. */
  readonly use: string;
  readonly foreground: string;
  readonly background: string;
  /** 4.5 for text, 3 for a graphic that carries meaning, null for decoration. */
  readonly min: 4.5 | 3 | null;
}

/**
 * Every pair ADR-0013 commits to. `min: null` means the pair is decorative and recorded only so a
 * reader can see what it measures — #F97316 on white is 2.8:1, which is exactly why the identity
 * never lets it be the only sign of anything.
 */
export const PAIRS: readonly Pair[] = [
  { use: "Body text", foreground: "foreground", background: "background", min: 4.5 },
  { use: "Body text on a muted section", foreground: "foreground", background: "muted", min: 4.5 },
  { use: "Headings", foreground: "heading", background: "background", min: 4.5 },
  { use: "Secondary text", foreground: "muted-foreground", background: "background", min: 4.5 },
  {
    use: "Secondary text on muted",
    foreground: "muted-foreground",
    background: "muted",
    min: 4.5,
  },
  { use: "Text on cards / panels", foreground: "card-foreground", background: "card", min: 4.5 },
  { use: "Text in popovers", foreground: "popover-foreground", background: "popover", min: 4.5 },
  {
    use: "Primary button label",
    foreground: "primary-foreground",
    background: "primary",
    min: 4.5,
  },
  {
    use: "Primary button label, hover",
    foreground: "primary-foreground",
    background: "primary-hover",
    min: 4.5,
  },
  // The button's own shape, not its label: this is what rules #F97316 out as a button fill.
  {
    use: "Primary button against the page",
    foreground: "primary",
    background: "background",
    min: 3,
  },
  {
    use: "Secondary button label",
    foreground: "secondary-foreground",
    background: "secondary",
    min: 4.5,
  },
  {
    use: "Hover / selected item text",
    foreground: "accent-foreground",
    background: "accent",
    min: 4.5,
  },
  { use: "Error text", foreground: "destructive", background: "background", min: 4.5 },
  { use: "Success text", foreground: "success", background: "background", min: 4.5 },
  { use: "Form field border", foreground: "input", background: "background", min: 3 },
  { use: "Focus ring", foreground: "ring", background: "background", min: 3 },
  { use: "Readiness line / progress marks", foreground: "chart-1", background: "card", min: 3 },
  { use: "Progress marks on the page", foreground: "chart-1", background: "background", min: 3 },
  {
    use: "Signature progress fill on its panel",
    foreground: "progress",
    background: "progress-surface",
    min: 3,
  },
  { use: "Highlighted quote text", foreground: "foreground", background: "highlight", min: 4.5 },
  {
    use: "Pen marks (note rules, annotation rings)",
    foreground: "pen",
    background: "background",
    min: 3,
  },
  {
    use: "Navigation text, current page",
    foreground: "nav-foreground",
    background: "nav",
    min: 4.5,
  },
  { use: "Navigation text, other pages", foreground: "nav-muted", background: "nav", min: 4.5 },
  {
    use: "Current-page marker and wordmark tick on the bar",
    foreground: "nav-accent",
    background: "nav",
    min: 3,
  },
  // Not in ADR-0013's table: the ADR set one page-wide focus ring and did not ask what it looks
  // like on the bar. It is 1.46:1 there, so inside the bar --ring becomes --nav-accent
  // (apps/web globals.css) — which makes this pair a promise of its own, measured here.
  {
    use: "Focus ring on the navigation bar",
    foreground: "nav-accent",
    background: "nav",
    min: 3,
  },
  {
    use: "Frames, section rules, note rails",
    foreground: "frame",
    background: "background",
    min: 3,
  },
  {
    use: "Brand orange #F97316 (decoration only)",
    foreground: "brand",
    background: "background",
    min: null,
  },
  { use: "Dividers (decorative)", foreground: "border", background: "background", min: null },
];

export interface Measurement extends Pair {
  readonly theme: "light" | "dark";
  readonly foregroundHex: string;
  readonly backgroundHex: string;
  readonly measured: number;
  readonly passes: boolean;
}

/** Every pair in both themes. Throws if a pair names a token the theme does not define. */
export function measure(cssPath?: string): Measurement[] {
  const themes = readThemes(cssPath);
  const out: Measurement[] = [];
  for (const theme of ["light", "dark"] as const) {
    const tokens = themes[theme];
    for (const pair of PAIRS) {
      const foregroundHex = tokens[pair.foreground];
      const backgroundHex = tokens[pair.background];
      if (!foregroundHex || !backgroundHex) {
        throw new Error(
          `${theme}: --${foregroundHex ? pair.background : pair.foreground} is not defined, but "${pair.use}" needs it`,
        );
      }
      const measured = ratio(foregroundHex, backgroundHex);
      out.push({
        ...pair,
        theme,
        foregroundHex,
        backgroundHex,
        measured,
        passes: pair.min === null || measured >= pair.min,
      });
    }
  }
  return out;
}

/** The table ADR-0013 and the package README carry. */
export function markdownTable(rows: Measurement[]): string {
  const fmt = (n: number): string => `${n.toFixed(2)}:1`;
  const verdict = (m: Measurement): string =>
    m.min === null ? "info" : m.passes ? "pass" : "FAIL";
  const byUse = new Map<string, { light?: Measurement; dark?: Measurement }>();
  for (const row of rows) {
    const entry = byUse.get(row.use) ?? {};
    entry[row.theme] = row;
    byUse.set(row.use, entry);
  }
  const lines = [
    "| Use | Tokens | Light | Ratio | Dark | Ratio | Needs |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const [use, { light, dark }] of byUse) {
    if (!light || !dark) continue;
    lines.push(
      `| ${use} | \`--${light.foreground}\` on \`--${light.background}\` | ` +
        `${light.foregroundHex} / ${light.backgroundHex} | ${fmt(light.measured)} ${verdict(light)} | ` +
        `${dark.foregroundHex} / ${dark.backgroundHex} | ${fmt(dark.measured)} ${verdict(dark)} | ` +
        `${light.min === null ? "—" : `${light.min}:1`} |`,
    );
  }
  return lines.join("\n");
}
