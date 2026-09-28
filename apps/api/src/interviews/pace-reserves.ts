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
  // 75 since 2026-09-29, provisionally and on a sample of eight: the median follow-up answer this
  // very report measured was 61 s and five of eight ran past the old 45. See `budgets.py` for why
  // over-reserving is the safe direction and how to revisit it.
  forAFollowUp: 75,
  toOpenAQuestion: 195,
  forCandidateQuestions: 90,
};
