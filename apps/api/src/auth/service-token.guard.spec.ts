import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { SERVICE_ONLY } from "./auth.decorators";
import { ServiceTokenGuard } from "./service-token.guard";

const TOKEN = "s".repeat(32);

/** A context whose route carries (or does not carry) the marker, with whatever header is given. */
function contextFor(options: { serviceOnly: boolean; authorization?: string }): {
  guard: ServiceTokenGuard;
  context: ExecutionContext;
} {
  const reflector = {
    getAllAndOverride: (key: string) => key === SERVICE_ONLY && options.serviceOnly,
  } as unknown as Reflector;
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({
        headers: options.authorization ? { authorization: options.authorization } : {},
      }),
    }),
  } as unknown as ExecutionContext;
  return {
    guard: new ServiceTokenGuard(reflector, { AI_WORKER_TOKEN: TOKEN } as Env),
    context,
  };
}

describe("the worker's own guard", () => {
  /**
   * The partition that makes this safe: this guard acts **only** on `@ServiceOnly()` routes, and
   * `AuthGuard` still demands a session on everything else. A route with no decorator at all is
   * therefore refused by the other guard, exactly as it was before this one existed.
   */
  it("says nothing about a route that is not the worker's", () => {
    const { guard, context } = contextFor({ serviceOnly: false });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("accepts the configured token", () => {
    const { guard, context } = contextFor({
      serviceOnly: true,
      authorization: `Bearer ${TOKEN}`,
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  /**
   * The last two cases are the ones worth having. A bare token with no scheme used to be **accepted**,
   * because the header was stripped of a `Bearer ` prefix rather than required to have one — harmless
   * on its own, and exactly the leniency that ends up being how a token arrives somewhere it should
   * not. `Basic` carrying the right token is the same mistake from the other side.
   */
  it("refuses a missing header, an empty bearer, the wrong token and a missing scheme alike", () => {
    for (const authorization of [undefined, "Bearer ", "Bearer wrong", TOKEN, `Basic ${TOKEN}`]) {
      const { guard, context } = contextFor({
        serviceOnly: true,
        ...(authorization ? { authorization } : {}),
      });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    }
  });

  /**
   * `timingSafeEqual` throws on buffers of different lengths, which would turn a length mismatch into
   * a 500 and leak the token's length through the difference between two statuses. A shorter or longer
   * presented token has to be an ordinary 401.
   */
  it("refuses a token of the wrong length as a 401, not as a crash", () => {
    for (const presented of ["s".repeat(31), "s".repeat(33)]) {
      const { guard, context } = contextFor({
        serviceOnly: true,
        authorization: `Bearer ${presented}`,
      });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    }
  });

  it("accepts the scheme in any case, because a header's scheme is case-insensitive", () => {
    const { guard, context } = contextFor({
      serviceOnly: true,
      authorization: `bearer ${TOKEN}`,
    });
    expect(guard.canActivate(context)).toBe(true);
  });
});
