import { describe, expect, it } from "vitest";
import { z } from "zod";
import { contractRegistry } from "./registry.js";

describe("contractRegistry", () => {
  it.each(Object.entries(contractRegistry))("%s exports to JSON Schema", (_name, schema) => {
    // Shared contracts may only use Zod features that survive JSON Schema export (ADR-0003 §5).
    expect(() => z.toJSONSchema(schema, { unrepresentable: "throw" })).not.toThrow();
  });
});

describe("contract ids", () => {
  it.each(Object.entries(contractRegistry))("%s has no root .meta({ id })", (_name, schema) => {
    expect(schema.meta()?.id).toBeUndefined();
  });
});
