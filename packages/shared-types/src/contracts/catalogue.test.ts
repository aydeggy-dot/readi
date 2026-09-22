import { describe, expect, it } from "vitest";
import { CATALOGUE_LIMITS } from "../constants.js";
import { CandidateCareerRole, CareerLevelInput, CareerRoleInput, StackInput } from "./catalogue.js";

const LEVEL_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const OTHER_LEVEL_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const STACK_ID = "3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f";
const OTHER_STACK_ID = "4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80";

const roleInput = (overrides: Record<string, unknown> = {}) => ({
  slug: "backend",
  name: "Backend engineer",
  summary: "APIs, data and the services behind them.",
  position: 1,
  supported_question_types: ["technical", "scenario", "behavioral"],
  levels: [LEVEL_ID, OTHER_LEVEL_ID],
  stacks: [
    { stack_id: STACK_ID, is_default: true },
    { stack_id: OTHER_STACK_ID, is_default: false },
  ],
  ...overrides,
});

describe("career roles", () => {
  it("accepts a role with its levels and stacks", () => {
    const role = CareerRoleInput.parse(roleInput());
    expect(role.levels).toHaveLength(2);
    expect(role.stacks[0]?.is_default).toBe(true);
  });

  it("accepts a role that offers no stacks — not every role has variants", () => {
    expect(CareerRoleInput.safeParse(roleInput({ stacks: [] })).success).toBe(true);
  });

  /*
   * The join tables key on the pair, so a repeat would be a database error surfacing as a slug
   * conflict — a message about the wrong thing entirely. It is a typo, and it is caught here.
   */
  it("rejects the same level twice", () => {
    const result = CareerRoleInput.safeParse(roleInput({ levels: [LEVEL_ID, LEVEL_ID] }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["levels"]);
  });

  it("rejects the same stack twice", () => {
    const stacks = [
      { stack_id: STACK_ID, is_default: true },
      { stack_id: STACK_ID, is_default: false },
    ];
    const result = CareerRoleInput.safeParse(roleInput({ stacks }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["stacks"]);
  });

  it("rejects two default stacks: a picker starts in one place", () => {
    const stacks = [
      { stack_id: STACK_ID, is_default: true },
      { stack_id: OTHER_STACK_ID, is_default: true },
    ];
    const result = CareerRoleInput.safeParse(roleInput({ stacks }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["stacks"]);
  });

  it("accepts no default at all — the candidate then chooses", () => {
    const stacks = [
      { stack_id: STACK_ID, is_default: false },
      { stack_id: OTHER_STACK_ID, is_default: false },
    ];
    expect(CareerRoleInput.safeParse(roleInput({ stacks })).success).toBe(true);
  });

  it("rejects the same question type twice", () => {
    const result = CareerRoleInput.safeParse(
      roleInput({ supported_question_types: ["technical", "technical"] }),
    );
    expect(result.success).toBe(false);
  });

  it("needs at least one question type: a role nobody can be interviewed for is not a role", () => {
    expect(CareerRoleInput.safeParse(roleInput({ supported_question_types: [] })).success).toBe(
      false,
    );
  });

  it("rejects a slug that is not a slug", () => {
    expect(CareerRoleInput.safeParse(roleInput({ slug: "Backend Engineer" })).success).toBe(false);
  });

  it("refuses more levels than a ladder has rungs", () => {
    const levels = Array.from(
      { length: CATALOGUE_LIMITS.roleLevels + 1 },
      (_, index) => `1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c${String(index).padStart(2, "0")}`,
    );
    expect(CareerRoleInput.safeParse(roleInput({ levels })).success).toBe(false);
  });
});

describe("career levels", () => {
  it("orders by rank, lowest first", () => {
    const level = CareerLevelInput.parse({
      slug: "intern-junior",
      name: "Intern / Junior",
      summary: null,
      rank: 10,
    });
    expect(level.rank).toBe(10);
  });

  it("rejects a rank beyond the ladder's range", () => {
    const input = {
      slug: "mid",
      name: "Mid-level",
      summary: null,
      rank: CATALOGUE_LIMITS.levelRankMax + 1,
    };
    expect(CareerLevelInput.safeParse(input).success).toBe(false);
  });
});

describe("stacks", () => {
  it("accepts a name with the punctuation real stacks have", () => {
    const stack = StackInput.parse({ slug: "java-spring", name: "Java / Spring", summary: null });
    expect(stack.name).toBe("Java / Spring");
  });
});

describe("the candidate shape", () => {
  /*
   * `content-no-answer-key.int.spec.ts` treats any key containing `levels` as a rubric's level
   * descriptors — answer key — so a candidate payload must not carry one. This test states that
   * rule where the shape is defined, rather than leaving it to a failure three files away.
   */
  it("calls a role's levels `level_options`, because `levels` is answer-key shaped", () => {
    const role = CandidateCareerRole.parse({
      slug: "qa",
      name: "QA engineer",
      summary: null,
      supported_question_types: ["test_design"],
      level_options: [{ slug: "mid", name: "Mid-level", summary: null }],
      stacks: [{ slug: "cypress", name: "Cypress", summary: null, is_default: true }],
    });
    expect(Object.keys(role).some((key) => /levels/i.test(key))).toBe(false);
    expect(role.level_options[0]?.name).toBe("Mid-level");
  });
});
