import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ADR-0013 commits to a 60 KB font budget on the first visit. Candidates are on mid-range Android
 * phones and pay for their data, so this is a promise to them, not a preference — if a face grows
 * or a fourth one appears, this fails before it reaches anyone.
 */
const DIR = fileURLToPath(new URL(".", import.meta.url));
const BUDGET_BYTES = 60 * 1024;

/** Downloaded on the first visit to any page. */
const FIRST_VISIT = ["alegreya-500.woff2", "alegreya-sans-400.woff2", "alegreya-sans-700.woff2"];

/** Downloaded only on a page that shows ₦ (unicode-range: U+20A6). */
const NAIRA = [
  "alegreya-naira-500.woff2",
  "alegreya-sans-naira-400.woff2",
  "alegreya-sans-naira-700.woff2",
];

const bytes = (file: string): number => statSync(`${DIR}${file}`).size;
/** Comments in the module discuss these same options, so they are stripped before counting. */
const source = readFileSync(`${DIR}index.ts`, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

describe("font budget", () => {
  it("keeps the first visit under 60 KB", () => {
    const total = FIRST_VISIT.reduce((sum, file) => sum + bytes(file), 0);
    const detail = FIRST_VISIT.map((f) => `${f} ${(bytes(f) / 1024).toFixed(1)} KB`).join(", ");
    expect(total, `${(total / 1024).toFixed(1)} KB — ${detail}`).toBeLessThanOrEqual(BUDGET_BYTES);
  });

  it("keeps each naira face tiny, so nobody swaps in a whole latin-ext subset", () => {
    for (const file of NAIRA) expect(bytes(file), file).toBeLessThan(4 * 1024);
  });

  it("ships no font that the module does not declare", () => {
    const shipped = readdirSync(DIR).filter((f) => f.endsWith(".woff2"));
    expect([...shipped].sort()).toEqual([...FIRST_VISIT, ...NAIRA].sort());
    for (const file of shipped) expect(source, `${file} is unused`).toContain(`./${file}`);
  });

  it("preloads one family and no more", () => {
    // Preloading the serif or a naira face would spend the budget before the page needs it.
    expect(source.match(/preload: true/g) ?? []).toHaveLength(1);
    expect(source.match(/preload: false/g) ?? []).toHaveLength(3);
  });

  it("restricts the naira faces to U+20A6 and gives them no catch-all fallback", () => {
    // Both matter for the stack order in globals.css: a naira family that matched anything else,
    // or that carried next/font's Arial fallback, would shadow the family behind it.
    expect(source.match(/prop: "unicode-range", value: "U\+20A6"/g) ?? []).toHaveLength(2);
    expect(source.match(/adjustFontFallback: false/g) ?? []).toHaveLength(2);
  });

  it("ships the OFL licence for both families", () => {
    for (const licence of ["OFL-Alegreya.txt", "OFL-Alegreya-Sans.txt"]) {
      expect(readFileSync(`${DIR}${licence}`, "utf8")).toContain("SIL OPEN FONT LICENSE");
    }
  });
});
