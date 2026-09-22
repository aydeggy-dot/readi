import { EMBEDDING_DIMENSIONS, EMBEDDING_LIMITS } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import { toVectorLiteral } from "./question-embeddings.repository";
import { QuestionEmbeddingsService } from "./question-embeddings.service";

describe("what a question is embedded from", () => {
  it("is the prompt and the setup a candidate reads with it", () => {
    expect(
      QuestionEmbeddingsService.textFor({ prompt: "Why is it slow?", context: "A React page." }),
    ).toBe("Why is it slow?\n\nA React page.");
  });

  it("is just the prompt when there is no setup", () => {
    expect(QuestionEmbeddingsService.textFor({ prompt: "Why?", context: null })).toBe("Why?");
  });

  it("never exceeds what the worker accepts", () => {
    const text = QuestionEmbeddingsService.textFor({
      prompt: "x".repeat(6_000),
      context: "y".repeat(6_000),
    });
    expect(text.length).toBe(EMBEDDING_LIMITS.textMaxLength);
  });
});

describe("the vector literal", () => {
  it("is pgvector's text form", () => {
    const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => index / 10_000);
    expect(toVectorLiteral(vector).startsWith("[0,0.0001,0.0002,")).toBe(true);
    expect(toVectorLiteral(vector).endsWith("]")).toBe(true);
  });

  it("refuses a vector the column could not hold", () => {
    // Better here than as a Postgres error in the middle of a publish (ADR-0006).
    expect(() => toVectorLiteral([0.1, 0.2])).toThrowError(/expected 1024 dimensions, got 2/);
  });
});
