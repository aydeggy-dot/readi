import "./instrument";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import * as Sentry from "@sentry/nestjs";
import { AppModule } from "./app.module";
import { EnvValidationError, parseEnv, type Env } from "./config/env";
import { createOpenApiDocument } from "./openapi";

function readEnv(): Env {
  try {
    return parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

async function bootstrap(): Promise<void> {
  const env = readEnv();
  const app = await NestFactory.create(AppModule.register(env));
  app.enableShutdownHooks();

  if (env.NODE_ENV !== "production") {
    SwaggerModule.setup("docs", app, createOpenApiDocument(app));
  }

  await app.listen(env.PORT, env.HOST);
  new Logger("Bootstrap").log(`API listening on http://${env.HOST}:${env.PORT}`);
}

// Startup failures (e.g. port already in use) exit cleanly with a logged error instead of an
// unhandled rejection, and reach Sentry when it is enabled.
bootstrap().catch(async (error: unknown) => {
  new Logger("Bootstrap").error(error instanceof Error ? (error.stack ?? error.message) : error);
  Sentry.captureException(error);
  await Sentry.flush(2000);
  process.exit(1);
});
