import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as contracts from "../index.js";

/** JSON Schema nodes whose `type` is a list, e.g. ["string", "null"]. */
function listTypes(node: unknown, path = "$"): string[] {
  if (Array.isArray(node)) return node.flatMap((item, i) => listTypes(item, `${path}[${i}]`));
  if (typeof node !== "object" || node === null) return [];
  const own = Array.isArray((node as { type?: unknown }).type) ? [path] : [];
  return [
    ...own,
    ...Object.entries(node).flatMap(([key, value]) => listTypes(value, `${path}.${key}`)),
  ];
}

describe("contracts used as NestJS DTOs", () => {
  // Zod writes a bare `z.string().nullable()` as `type: ["string", "null"]`, which @nestjs/swagger
  // turns into an ARRAY of strings in the OpenAPI document (and so in @readi/api-client). Give such
  // fields a constraint (format, pattern, min…) so Zod emits `anyOf` instead.
  it("never use a list-valued JSON Schema `type`", () => {
    const offenders = Object.entries(contracts).flatMap(([name, value]) =>
      value instanceof z.ZodType
        ? listTypes(z.toJSONSchema(value, { io: "output", unrepresentable: "any" })).map(
            (path) => `${name} ${path}`,
          )
        : [],
    );
    expect(offenders).toEqual([]);
  });
});
