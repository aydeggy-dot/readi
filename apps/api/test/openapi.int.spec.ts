import { readFileSync } from "node:fs";
import { join } from "node:path";
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
      for (const path of [
        "/api/me/profile",
        "/api/me/consents",
        "/api/me/onboarding/complete",
        "/api/me/cv",
        "/api/me/cv/uploads",
        "/api/me/cv/parsed",
        "/api/me/export",
        "/api/me/deletion",
        "/api/auth-methods",
        "/api/content/track",
        "/api/content/practice",
        "/api/content/lessons/{slug}",
        "/api/admin/content/topics",
        "/api/admin/content/tracks",
        "/api/admin/content/tracks/{id}",
        "/api/admin/content/tracks/{id}/modules",
        "/api/admin/content/modules/{id}",
        "/api/admin/content/modules/{id}/lessons",
        "/api/admin/content/lessons",
        "/api/admin/content/lessons/{id}",
        "/api/admin/content/rubrics",
        "/api/admin/content/rubrics/{id}",
        "/api/admin/content/questions",
        "/api/admin/content/questions/{id}",
        "/api/admin/content/questions/duplicate-check",
        "/api/admin/content/{entity}/{id}/transition",
        "/api/admin/content/{entity}/{id}/versions",
        "/api/admin/content/{entity}/{id}/versions/{version}",
      ]) {
        expect(document.paths).toHaveProperty([path]);
      }
      // Development-only routes stay out of the published contract.
      expect(Object.keys(document.paths).some((p) => p.includes("dev/mailbox"))).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("matches the committed document the API client is generated from (ADR-0012)", async () => {
    // The committed file comes from `export-openapi` (no database); this proves it equals what the
    // running app serves. If it fails, run `pnpm gen:contracts` and commit the result.
    const committed: unknown = JSON.parse(
      readFileSync(join(__dirname, "../../../packages/api-client/openapi.json"), "utf8"),
    );
    const app = await createTestApp();
    try {
      expect(JSON.parse(JSON.stringify(createOpenApiDocument(app)))).toEqual(committed);
    } finally {
      await app.close();
    }
  });
});
