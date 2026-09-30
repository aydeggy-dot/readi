import { timingSafeEqual } from "node:crypto";
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { SERVICE_ONLY } from "./auth.decorators";

/**
 * The **second direction of authentication** (ADR-0019's consequences): routes the AI worker calls.
 *
 * Until M5 the worker was only ever called; the LiveKit agent drives the engine in-process and has to
 * push what happened back, so `/api/internal/...` exists and is reached with the same shared
 * `AI_WORKER_TOKEN` (the worker's `SERVICE_TOKEN`) travelling the other way.
 *
 * It is a **second global guard beside `AuthGuard`, not a `@Public()` route with a check inside it**.
 * `@Public()` would say in the metadata that an internal route is public, which is the opposite of
 * true, and the default-deny rule would then be enforced by a decorator somebody could forget. Here
 * the two guards partition every route between them: `AuthGuard` needs a session unless the route is
 * `@Public()` or `@ServiceOnly()`, and this one needs the token *only* on `@ServiceOnly()` — so a
 * route with no decorator at all is still refused, by the other guard, exactly as before.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (!this.reflector.getAllAndOverride<boolean>(SERVICE_ONLY, targets)) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    /*
     * The scheme is **required**, not stripped if present. `replace(/^Bearer /i, "")` accepted a bare
     * token as readily as a well-formed header — harmless on its own, since the token is still the
     * token, but it is the sort of leniency that ends up being how a token arrives somewhere it should
     * not. The worker always sends `Bearer <token>` (`voice/api_client.py`), so strictness costs
     * nothing. Case-insensitive because an HTTP auth scheme is.
     */
    const header = request.headers.authorization;
    const scheme = typeof header === "string" ? /^Bearer (?<token>.*)$/is.exec(header) : null;
    const presented = scheme?.groups?.token ?? "";
    if (!matches(presented, this.env.AI_WORKER_TOKEN)) {
      // No code and no detail: there is no client here to explain anything to, and a 401 that says
      // which half was wrong is a 401 that helps somebody guess the other half.
      throw new UnauthorizedException();
    }
    return true;
  }
}

/**
 * Constant-time, and length-safe.
 *
 * `timingSafeEqual` throws on buffers of different lengths, which would leak the token's length
 * through the difference between a 401 and a 500 — so the lengths are compared first and a
 * mismatch answers false rather than comparing at all.
 */
function matches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
