import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { parseEnv } from "../src/config/env";
import { createOpenApiDocument } from "../src/openapi";

describe("OpenAPI document", () => {
  it("builds from the Zod DTOs and documents /health", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(parseEnv(process.env))],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      const document = createOpenApiDocument(app);

      expect(Object.keys(document.paths["/health"]?.get?.responses ?? {})).toEqual(
        expect.arrayContaining(["200", "503"]),
      );
    } finally {
      await app.close();
    }
  });
});
