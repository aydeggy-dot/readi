import { describe, expect, it } from "vitest";
import { isOfferedToStack, stackFilter } from "./question-eligibility";

/** Exported with the table below, so the integration test can map them onto its own two stacks. */
export const SPRING = "11111111-1111-4111-8111-111111111111";
export const NODE = "22222222-2222-4222-8222-222222222222";
/**
 * A third stack, standing for a variant that *another role* offers — `react-node` is full-stack's
 * default, and `react-typescript` is frontend's. They are different rows, so the last two rows of
 * the table below are the whole of the full-stack tagging trap (`content/seed/blueprints/fullstack.md`).
 */
export const REACT_NODE = "33333333-3333-4333-8333-333333333333";

/**
 * The truth table the rule is defined by. `apps/api/test/content-stacks.int.spec.ts` **imports this
 * table** and runs it against the database through `stackFilter`, so the predicate and the query
 * cannot drift apart without one of the two failing, and a row added here is exercised by both.
 */
export const STACK_RULE: { question: string[]; candidate: string | null; offered: boolean }[] = [
  { question: [], candidate: null, offered: true },
  { question: [], candidate: SPRING, offered: true },
  { question: [SPRING], candidate: SPRING, offered: true },
  { question: [SPRING], candidate: NODE, offered: false },
  { question: [SPRING], candidate: null, offered: false },
  { question: [SPRING, NODE], candidate: NODE, offered: true },
  /*
   * The two rows that cost us a role. A question tagged for one role's variant is invisible to a
   * candidate on another role's variant, however well the question transfers — a full-stack
   * candidate on React + Node is not on React + TypeScript, and nothing infers one from the other.
   * The only thing that reaches them is the second tag, which is why M2.5 put `react-node` on the
   * two React questions and why every stack-tagged question that a full-stack interview would ask
   * carries a full-stack variant too. `check-bank.mjs` refuses a question whose role can never be
   * offered it.
   */
  { question: [SPRING], candidate: REACT_NODE, offered: false },
  { question: [SPRING, REACT_NODE], candidate: REACT_NODE, offered: true },
];

describe("the stack rule", () => {
  it.each(STACK_RULE)(
    "offers a question tagged $question to a candidate on $candidate: $offered",
    ({ question, candidate, offered }) => {
      expect(isOfferedToStack(question, candidate)).toBe(offered);
    },
  );

  it("treats an untagged question as general, which is what most questions are", () => {
    expect(isOfferedToStack([], NODE)).toBe(true);
  });

  it("does not infer one role's variant from another's, however well the question transfers", () => {
    // A frontend React question is not offered to a full-stack React + Node candidate unless it
    // says so. Tagging is the only mechanism; there is no hierarchy between stacks and no
    // "related variant" inference, by design — see blueprints/fullstack.md.
    expect(isOfferedToStack([SPRING], REACT_NODE)).toBe(false);
    expect(isOfferedToStack([SPRING, REACT_NODE], REACT_NODE)).toBe(true);
  });

  it("offers a candidate who chose no stack the general questions only", () => {
    // The decision, asserted rather than implied: a smaller coherent set beats a feed that mixes
    // three frameworks because nobody said which one the candidate uses.
    expect(isOfferedToStack([SPRING], null)).toBe(false);
    expect(isOfferedToStack([], null)).toBe(true);
  });

  it("asks the database for general questions alone when no stack was chosen", () => {
    expect(stackFilter(null)).toEqual({ stacks: { none: {} } });
  });

  it("asks for general questions or the candidate's own when one was chosen", () => {
    // `AND`-wrapped on purpose, so that spreading the fragment next to another `where` clause does
    // not let one of the two `OR`s overwrite the other. M3 composes this with a fallback of its own.
    expect(stackFilter(SPRING)).toEqual({
      AND: [{ OR: [{ stacks: { none: {} } }, { stacks: { some: { stackId: SPRING } } }] }],
    });
  });
});
