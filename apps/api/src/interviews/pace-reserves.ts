import type { PaceReserves } from "./pace";

/**
 * The reserves the engine applies, copied from `apps/ai-worker/readi_worker/interview/budgets.py`.
 *
 * A copy, and CLAUDE.md is right that two copies drift — so this one is **checked rather than
 * trusted**: `pace.spec.ts` reads `budgets.py` and fails if the numbers have moved apart, the way
 * `ask-vectors.json` keeps the ask counter's two implementations honest. It is three integers rather
 * than a generated contract because they are engine internals the worker owns, and moving them into
 * `shared-types` would make a pace report the reason the engine's own constants live somewhere else.
 *
 * A report that printed one number while the engine applied another would be worse than no report,
 * because somebody would set a constant from it.
 */
export const ENGINE_RESERVES: PaceReserves = {
  forAQuestion: 120,
  forAFollowUp: 45,
  toOpenAQuestion: 165,
  forCandidateQuestions: 90,
};
