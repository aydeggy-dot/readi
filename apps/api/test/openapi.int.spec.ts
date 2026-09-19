import { describe, expect, it } from "vitest";
import { createOpenApiDocument } from "../src/openapi";
import { createTestApp } from "./helpers";

describe("OpenAPI document", () => {
  it("builds from the Zod DTOs and documents the API", async () => {
    const app = await createTestApp();
    try {
      const document = createOpenApiDocument(app);

      expect(Object.keys(document.paths["/health"]?.get?.responses ?? {})).toEqual(
        expect.arrayContaining(["200", "503"]),
      );
      expect(document.paths).toHaveProperty(["/api/me"]);
      expect(document.paths).toHaveProperty(["/api/admin/stats"]);
      // Development-only routes stay out of the published contract.
      expect(Object.keys(document.paths).some((p) => p.includes("dev/mailbox"))).toBe(false);
    } finally {
      await app.close();
    }
  });
});
