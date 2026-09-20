import type { ContentStatus } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import { availableTransitions, checkTransition, isCandidateVisible } from "./content-workflow";

const STATUSES: ContentStatus[] = ["draft", "in_review", "published", "retired"];

describe("the content workflow", () => {
  it("walks draft → in_review → published → retired", () => {
    expect(checkTransition("submit", "draft", "content_expert")).toMatchObject({
      allowed: true,
      rule: { to: "in_review" },
    });
    expect(checkTransition("publish", "in_review", "admin")).toMatchObject({
      allowed: true,
      rule: { to: "published" },
    });
    expect(checkTransition("retire", "published", "admin")).toMatchObject({
      allowed: true,
      rule: { to: "retired" },
    });
  });

  it("sends work back to draft from review and from retirement", () => {
    for (const status of ["in_review", "retired"] as const) {
      expect(checkTransition("return_to_draft", status, "content_expert")).toMatchObject({
        allowed: true,
        rule: { to: "draft" },
      });
    }
  });

  it("lets only an admin publish or retire, whatever the status", () => {
    for (const status of STATUSES) {
      for (const transition of ["publish", "retire"] as const) {
        expect(checkTransition(transition, status, "content_expert")).toMatchObject({
          allowed: false,
          because: "role",
        });
      }
    }
  });

  it("refuses a candidate every move", () => {
    for (const transition of ["submit", "publish", "retire", "return_to_draft"] as const) {
      for (const status of STATUSES) {
        expect(checkTransition(transition, status, "candidate")).toMatchObject({
          allowed: false,
          because: "role",
        });
      }
    }
  });

  // Why role before status: a content expert told "a draft cannot be published" would go looking
  // for an in-review one, when the answer is that publishing is not theirs to do.
  it("answers a content expert asking to publish a draft with the role, not the status", () => {
    expect(checkTransition("publish", "draft", "content_expert")).toMatchObject({
      allowed: false,
      because: "role",
    });
  });

  it("refuses a move from the wrong status", () => {
    expect(checkTransition("publish", "draft", "admin")).toMatchObject({
      allowed: false,
      because: "status",
      from: ["in_review"],
    });
    expect(checkTransition("submit", "published", "admin")).toMatchObject({
      allowed: false,
      because: "status",
    });
    expect(checkTransition("retire", "draft", "admin")).toMatchObject({
      allowed: false,
      because: "status",
    });
  });

  it("offers each role the moves it can actually make", () => {
    expect(availableTransitions("draft", "content_expert")).toEqual(["submit"]);
    expect(availableTransitions("in_review", "content_expert")).toEqual(["return_to_draft"]);
    expect(availableTransitions("in_review", "admin")).toEqual(["return_to_draft", "publish"]);
    expect(availableTransitions("published", "admin")).toEqual(["retire"]);
    expect(availableTransitions("published", "content_expert")).toEqual([]);
    expect(availableTransitions("draft", "candidate")).toEqual([]);
  });

  it("shows candidates published content and nothing else", () => {
    expect(STATUSES.filter(isCandidateVisible)).toEqual(["published"]);
  });
});
