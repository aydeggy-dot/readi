import type { PlannedFollowUp } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import { followUpsAsked, promptedCriteria, type TurnForPrompting } from "./prompting";

/**
 * Which criteria the engine had to ask about — read from the transcript and the pinned probe menu.
 *
 * The case that makes this file worth having is the last one: **a criterion may carry two probes**
 * (owner's decision, 2026-09-23), so the menu is a flat list in which two entries may name the same
 * criterion, and anything keyed by criterion loses the second. `review-doc.ts` was written that way
 * and silently under-reported a whole bank; the owner named it as the trap for this phase.
 */
describe("promptedCriteria", () => {
  const interviewer = (followUpIndex: number | null): TurnForPrompting => ({
    speaker: "interviewer",
    followUpIndex,
  });
  const candidate = (): TurnForPrompting => ({ speaker: "candidate", followUpIndex: null });

  const menu: PlannedFollowUp[] = [
    { criterion: 1, probe: "What did you measure?" },
    { criterion: 2, probe: "And what did you change?" },
  ];

  it("is empty when the engine asked nothing", () => {
    expect(promptedCriteria(menu, [interviewer(null), candidate()])).toEqual([]);
  });

  it("names the criterion the probe was for, not the probe", () => {
    // `follow_up_index` is a position in the menu; the criterion is what the menu says it is for.
    expect(promptedCriteria(menu, [interviewer(null), candidate(), interviewer(1)])).toEqual([2]);
  });

  it("reports one criterion for two probes that share it", () => {
    /*
     * The two-probe case. A criterion scoring two separable things may carry two probes and never
     * three, and both may be asked — so two entries of the menu resolve to one criterion. Anything
     * keyed by criterion would have dropped probe 1 here and reported nothing was prompted; keyed by
     * probe, both resolve, and the set collapses them.
     */
    const twoProbes: PlannedFollowUp[] = [
      { criterion: 1, probe: "Which queries?" },
      { criterion: 1, probe: "And what did they cost?" },
    ];
    expect(promptedCriteria(twoProbes, [interviewer(0), interviewer(1)])).toEqual([1]);
  });

  it("sorts by criterion, so a stored list reads in rubric order", () => {
    expect(promptedCriteria(menu, [interviewer(1), interviewer(0)])).toEqual([1, 2]);
  });

  it("ignores a probe index the pinned menu does not have", () => {
    // The transcript says something was asked that the snapshot cannot name. Not scoreable as
    // prompting, and not worth guessing at.
    expect(promptedCriteria(menu, [interviewer(9)])).toEqual([]);
  });

  it("ignores a candidate turn that somehow carries a probe index", () => {
    // The engine writes `follow_up_index: null` on every candidate turn. If one ever arrived with an
    // index, counting it would say a criterion was prompted because the candidate answered.
    expect(promptedCriteria(menu, [{ speaker: "candidate", followUpIndex: 0 }])).toEqual([]);
  });
});

describe("followUpsAsked", () => {
  it("counts interviewer turns that named a probe", () => {
    expect(
      followUpsAsked([
        { speaker: "interviewer", followUpIndex: null },
        { speaker: "candidate", followUpIndex: null },
        { speaker: "interviewer", followUpIndex: 0 },
        { speaker: "candidate", followUpIndex: null },
        { speaker: "interviewer", followUpIndex: 1 },
      ]),
    ).toBe(2);
  });

  it("counts two probes for one criterion as two follow-ups", () => {
    // Unlike `promptedCriteria`, which collapses them: this is how many times the candidate was
    // asked, and they were asked twice.
    expect(
      followUpsAsked([
        { speaker: "interviewer", followUpIndex: 0 },
        { speaker: "interviewer", followUpIndex: 1 },
      ]),
    ).toBe(2);
  });
});
