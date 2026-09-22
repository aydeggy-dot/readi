import { describe, expect, it } from "vitest";
import { isOfferedToStack, stackFilter } from "./question-eligibility";

const SPRING = "11111111-1111-4111-8111-111111111111";
const NODE = "22222222-2222-4222-8222-222222222222";

/**
 * The truth table the rule is defined by. `question-catalogue.int.spec.ts` runs the same table
 * against the database through `stackFilter`, so the predicate and the query cannot drift apart
 * without one of the two failing.
 */
export const STACK_RULE: { question: string[]; candidate: string | null; offered: boolean }[] = [
  { question: [], candidate: null, offered: true },
  { question: [], candidate: SPRING, offered: true },
  { question: [SPRING], candidate: SPRING, offered: true },
  { question: [SPRING], candidate: NODE, offered: false },
  { question: [SPRING], candidate: null, offered: false },
  { question: [SPRING, NODE], candidate: NODE, offered: true },
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
    expect(stackFilter(SPRING)).toEqual({
      OR: [{ stacks: { none: {} } }, { stacks: { some: { stackId: SPRING } } }],
    });
  });
});
