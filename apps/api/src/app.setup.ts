import type { NestExpressApplication } from "@nestjs/platform-express";
import { toNodeHandler } from "better-auth/node";
import { BETTER_AUTH, type BetterAuthInstance } from "./auth/better-auth.factory";
import type { Env } from "./config/env";
import { ENV } from "./config/env.module";
import { trustedClientIp } from "./http/trusted-client-ip";

/**
 * HTTP wiring shared by main.ts and the integration tests. The app must be created with
 * `bodyParser: false`: Better Auth reads the raw request body, so its handler is mounted before
 * the JSON parser (ADR-0009).
 */
export function configureApp(app: NestExpressApplication): void {
  // Everything is under /api (the web app proxies /api/* same-origin); /health stays at the root.
  app.setGlobalPrefix("api", { exclude: ["health"] });

  const env = app.get<Env>(ENV);
  const auth = app.get<BetterAuthInstance>(BETTER_AUTH);
  const express = app.getHttpAdapter().getInstance();
  express.use(trustedClientIp(env.WEB_PROXY_SECRET));
  express.all("/api/auth/{*path}", toNodeHandler(auth));

  app.useBodyParser("json", { limit: "100kb" });
  app.enableShutdownHooks();
}
