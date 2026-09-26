import { CONSENT_VERSIONS } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import { isCurrentGrant, type LatestConsent } from "./consent-eligibility";

const CURRENT = CONSENT_VERSIONS.transcript_review;

/**
 * The whole rule, as a table, because the failure it prevents is silent: a sampler that treats a
 * stale yes as a yes shows one person's words to another with no error anywhere (ADR-0017).
 */
const GRANT_RULE: { case: string; latest: LatestConsent | undefined; granted: boolean }[] = [
  { case: "never decided", latest: undefined, granted: false },
  { case: "granted the current text", latest: { granted: true, version: CURRENT }, granted: true },
  {
    case: "declined the current text",
    latest: { granted: false, version: CURRENT },
    granted: false,
  },
  {
    case: "granted an older text — a yes to a question they never saw",
    latest: { granted: true, version: CURRENT - 1 },
    granted: false,
  },
  {
    case: "declined an older text",
    latest: { granted: false, version: CURRENT - 1 },
    granted: false,
  },
  {
    case: "granted a version we do not have yet",
    latest: { granted: true, version: CURRENT + 1 },
    granted: false,
  },
];

describe("isCurrentGrant", () => {
  it.each(GRANT_RULE)("$case → $granted", ({ latest, granted }) => {
    expect(isCurrentGrant("transcript_review", latest)).toBe(granted);
  });

  it("reads the version that belongs to the type it was asked about", () => {
    // A grant at version 1 of one type says nothing about a type whose text is at version 2.
    expect(
      isCurrentGrant("marketing", { granted: true, version: CONSENT_VERSIONS.marketing }),
    ).toBe(true);
  });
});
