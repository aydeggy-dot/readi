import { describe, expect, it } from "vitest";
import { markdownTable, measure, PAIRS, ratio, readThemes } from "./contrast.ts";

/**
 * The accessibility gate for the Margin theme (ADR-0013). Every text pair must clear 4.5:1 and
 * every graphic that carries meaning 3:1, in BOTH themes — a theme that only works in light mode
 * is a theme that fails half our users. This runs in `pnpm test`, so CI blocks on it.
 *
 * `CONTRAST_TABLE=1 pnpm --filter @readi/ui test` prints the table for the ADR and the README.
 */
const rows = measure();

describe("Margin tokens", () => {
  it.each(rows.filter((row) => row.min !== null))(
    "$theme: $use is at least $min:1",
    ({ measured, min, foreground, background, foregroundHex, backgroundHex }) => {
      expect(
        measured,
        `--${foreground} (${foregroundHex}) on --${background} (${backgroundHex}) is ${measured.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(min ?? 0);
    },
  );

  it("defines every token the pairs name, in both themes", () => {
    // measure() throws on a missing token, so deleting one can never silently skip its pair.
    expect(() => measure()).not.toThrow();
    expect(rows).toHaveLength(PAIRS.length * 2);
  });

  it("keeps the brand orange out of anything that must carry meaning on its own", () => {
    // #F97316 is 2.8:1 on white. The identity allows it as decoration only, and the theme must not
    // quietly promote it into --primary, --ring, --pen or --progress (ADR-0013).
    const { light, dark } = readThemes();
    for (const theme of [light, dark]) {
      for (const token of ["primary", "ring", "pen", "progress", "input", "frame"]) {
        expect(theme[token], `--${token} must not be the decorative brand orange`).not.toBe(
          theme.brand,
        );
      }
    }
  });

  it("computes known ratios correctly", () => {
    expect(ratio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(ratio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // The value ADR-0013 records for the primary button label in light mode.
    expect(ratio("#ffffff", "#c2410c")).toBeCloseTo(5.18, 2);
  });

  it("prints the table when asked", () => {
    const table = markdownTable(rows);
    expect(table.split("\n")).toHaveLength(PAIRS.length + 2);
    if (process.env.CONTRAST_TABLE) console.log(`\n${table}\n`);
  });
});
