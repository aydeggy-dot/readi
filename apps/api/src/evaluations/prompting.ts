import type { PlannedFollowUp, TurnSpeaker } from "@readi/shared-types";

/**
 * Which criteria the engine had to ask about — the **engine fact** the scoring adjustment is keyed
 * on (owner's decision, 2026-09-26).
 *
 * ## Why this and not the coverage model's verdict
 *
 * `session_turns.criteria_covered` holds a model's judgement of whether an answer touched a
 * criterion, and M3 wrote down that it reaches M4's evaluator "as a prior and **never** as a score".
 * This is the other record of the same moment and it is a better one for marking: the engine asks a
 * probe only for a criterion the answer has not already covered, so **a probe having been asked is
 * the engine's own record that the criterion was not volunteered** — and unlike a private judgement,
 * the candidate can see it. It is in their transcript, in words, and they can argue with it. A
 * candidate cannot argue with a flag a model set about them.
 *
 * ## Per probe, never per criterion
 *
 * A criterion may carry **two** probes (owner's decision, 2026-09-23) — two separable things the same
 * criterion scores — and the pinned `planned_follow_ups` are a flat list, so two entries may name the
 * same `criterion`. Anything that builds a `Map` keyed by criterion therefore drops the second, which
 * is not a hypothetical: `review-doc.ts` did exactly that and silently under-reported a bank.
 *
 * So the array is **indexed by probe** — `follow_up_index` is a position in it, which is what the
 * engine allocated and what `session_turns.follow_up_index` records — and the criteria are collapsed
 * into a set only at the end, where collapsing is what we actually want: a criterion probed twice was
 * prompted once as far as the arithmetic is concerned, because the candidate needed a nudge either
 * way and needing two is not worth two discounts.
 */
export interface TurnForPrompting {
  speaker: TurnSpeaker;
  /** The probe the **interviewer** was asking. Candidate turns always carry null (the engine's rule). */
  followUpIndex: number | null;
}

export function promptedCriteria(
  plannedFollowUps: readonly PlannedFollowUp[],
  turns: readonly TurnForPrompting[],
): number[] {
  const prompted = new Set<number>();
  for (const turn of turns) {
    // Only the interviewer asks. A candidate turn with an index would be a bug upstream, and
    // counting it would double every follow-up.
    if (turn.speaker !== "interviewer" || turn.followUpIndex === null) continue;
    const probe = plannedFollowUps[turn.followUpIndex];
    // A probe index the pinned menu does not have: the transcript says something was asked that the
    // snapshot cannot name. Not scoreable as prompting, and not worth guessing at.
    if (!probe) continue;
    prompted.add(probe.criterion);
  }
  return [...prompted].sort((a, b) => a - b);
}

/**
 * How many follow-ups were asked in this exchange — one per interviewer turn that named a probe.
 *
 * Counted from the transcript rather than read from `interview_session_questions.follow_ups_asked`
 * for the same reason that column is recounted rather than incremented: the transcript is the record,
 * and a report assembled from a count that drifted would be a report about a session that did not
 * happen.
 */
export function followUpsAsked(turns: readonly TurnForPrompting[]): number {
  return turns.filter((turn) => turn.speaker === "interviewer" && turn.followUpIndex !== null)
    .length;
}
