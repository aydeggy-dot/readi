// Writes the OpenAPI document to a file without starting the server or touching any database:
//   node dist/src/cli/export-openapi.js <out.json>
// Used by scripts/gen-api-client.sh to generate packages/api-client (ADR-0012).
import { writeFileSync } from "node:fs";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "../app.module";
import { parseEnv } from "../config/env";
import { createOpenApiDocument } from "../openapi";

async function main(): Promise<void> {
  const out = process.argv[2];
  if (!out) throw new Error("usage: export-openapi <out.json>");

  // A fixed configuration, so the document never depends on the local .env. Nothing connects:
  // `preview` builds the module graph (routes and DTOs) without instantiating providers.
  const env = parseEnv({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://openapi@127.0.0.1:9/openapi",
    REDIS_URL: "redis://127.0.0.1:9",
    BETTER_AUTH_SECRET: "openapi-export-only-not-a-real-secret-000",
  });
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env), {
    preview: true,
    logger: false,
  });
  app.setGlobalPrefix("api", { exclude: ["health"] });
  const document = createOpenApiDocument(app);
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  new Logger("OpenAPI").log(`wrote ${Object.keys(document.paths).length} paths to ${out}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
