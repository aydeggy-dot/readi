import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentErrorMessage } from "./content-errors";

/**
 * Every refusal the content API can answer with has to have copy, because the web app never shows
 * the server's English (ADR-0012). The M2.5 review found three that did not — `role_not_found`,
 * `level_not_found` and `stack_not_found`, raised when a save names a catalogue row that is no
 * longer there — and the CMS fell back to "Check this field" with no field marked.
 *
 * So rather than a list this file has to remember to grow, the codes are read out of the API's own
 * source. It is a blunt instrument: it finds string literals, not reachable throws. That is the
 * right trade here — a false positive costs one line of copy, and a false negative costs the
 * editor an unexplained failure.
 */

const CONTENT_SOURCE = join(__dirname, "../../../api/src/content");

/** `new ApiError(status, "code", …)`, `this.notFound("code")`, `this.noSuchCatalogueRow("code", …)`. */
const CODE_PATTERNS = [
  /new ApiError\(\s*[^,]+,\s*"([a-z0-9_]+)"/g,
  /\bnotFound\(\s*"([a-z0-9_]+)"/g,
  /\bnoSuchCatalogueRow\(\s*"([a-z0-9_]+)"/g,
  /orderedIds\([^)]*?"([a-z0-9_]+)"/gs,
];

/*
 * Raised by the content service but never seen by the CMS: `content_flag_*` is the candidate's
 * flag form, and the two below are answered to a *candidate* asking for their track, where the
 * copy lives in the candidate pages. Listed rather than silently skipped so that adding to this
 * set is a decision somebody makes on purpose.
 */
const CANDIDATE_ONLY = new Set(["profile_required", "lesson_not_published"]);

const codesRaisedByTheApi = (): string[] => {
  const codes = new Set<string>();
  for (const file of readdirSync(CONTENT_SOURCE)) {
    if (!file.endsWith(".ts") || file.endsWith(".spec.ts")) continue;
    const source = readFileSync(join(CONTENT_SOURCE, file), "utf8");
    for (const pattern of CODE_PATTERNS) {
      for (const [, code] of source.matchAll(pattern)) if (code) codes.add(code);
    }
  }
  return [...codes].filter((code) => !CANDIDATE_ONLY.has(code)).sort();
};

describe("the CMS error map", () => {
  it("has copy for every code the content API raises", () => {
    const raised = codesRaisedByTheApi();
    // A sanity check on the scrape itself: if the patterns stop matching, the test must fail
    // loudly rather than pass over an empty list.
    expect(raised.length).toBeGreaterThan(10);

    const unmapped = raised.filter(
      (code) => contentErrorMessage({ code, message: "ignored" }) === undefined,
    );
    expect(unmapped).toEqual([]);
  });

  it("says how many candidates a refusal is about, and gets the grammar right for one", () => {
    const many = contentErrorMessage({
      code: "role_level_in_use",
      message: "ignored",
      details: { profiles: 4 },
    });
    expect(many).toContain("4 candidates");

    const one = contentErrorMessage({
      code: "role_level_in_use",
      message: "ignored",
      details: { profiles: 1 },
    });
    expect(one).toContain("One candidate is");
    expect(one).not.toContain("1 candidates");

    // A body with no details at all must still produce copy rather than throwing.
    expect(contentErrorMessage({ code: "role_stack_in_use", message: "ignored" })).toBeTruthy();
  });

  it("does not show the server's message", () => {
    expect(
      contentErrorMessage({ code: "content_slug_taken", message: "slug taken" }),
    ).not.toContain("slug taken");
    expect(contentErrorMessage({ code: "something_new", message: "whatever" })).toBeUndefined();
  });
});
