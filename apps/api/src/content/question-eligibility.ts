import type { Prisma } from "../generated/prisma/client";

/**
 * **The stack rule** (ADR-0015, M2.5 decision 5), in one place because M3 will select questions
 * for a live interview with exactly this rule and must not re-derive it.
 *
 * A question with no stack tags is *general to its role* and is offered to everyone preparing for
 * it. A question with stack tags is offered only to a candidate on one of those stacks. So:
 *
 * | question tags | candidate's stack | offered |
 * |---|---|---|
 * | none          | anything, or none | yes — general questions are the common case |
 * | `[java-spring]` | `java-spring`   | yes |
 * | `[java-spring]` | `nodejs`        | no — it would be a Spring question asked of a Node dev |
 * | `[java-spring]` | none chosen     | **no** |
 *
 * That last row is the decision worth stating. A candidate who has not chosen a variant could
 * reasonably be shown everything or shown only the general set; we show the general set. Handing
 * someone Spring code, then React code, then Rails code, because we do not know which they use,
 * is a worse experience than a smaller coherent set — and the onboarding picker starts on the
 * role's default, so arriving here with no stack means the candidate deliberately declined to say.
 */
export function isOfferedToStack(
  /** The stacks the question is tagged for; empty means general. */
  questionStackIds: readonly string[],
  /** The stack the candidate is interviewing for, or null if they have not chosen one. */
  candidateStackId: string | null,
): boolean {
  if (questionStackIds.length === 0) return true;
  return candidateStackId !== null && questionStackIds.includes(candidateStackId);
}

/**
 * The same rule as a database filter, because the candidate's feed cannot load every question to
 * run the predicate over it.
 *
 * Two expressions of one rule is a drift risk, so they are kept next to each other and share one
 * truth table: `STACK_RULE` in `question-eligibility.spec.ts` runs it through the predicate, and
 * `apps/api/test/content-stacks.int.spec.ts` imports the same table and runs it through this
 * filter against real rows. Adding a row to it therefore exercises both.
 */
export function stackFilter(candidateStackId: string | null): Prisma.QuestionWhereInput {
  const general = { stacks: { none: {} } };
  if (candidateStackId === null) return general;
  /*
   * Wrapped in `AND` rather than returned as a bare top-level `OR`, so that spreading it into a
   * `where` beside another fragment is additive. M3 is told to reuse this filter, and its question
   * selection has an `OR` of its own ("not seen in the last 3 sessions, or the least recently seen
   * when too few remain"); two bare `OR` keys in one object literal means the second silently wins
   * and one of the two rules disappears, with no type error and no failing test.
   */
  return { AND: [{ OR: [general, { stacks: { some: { stackId: candidateStackId } } }] }] };
}
