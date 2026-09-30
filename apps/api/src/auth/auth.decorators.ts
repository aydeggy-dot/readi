import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Role } from "@readi/shared-types";
import type { AuthenticatedUser, AuthSession } from "./auth.service";

export const IS_PUBLIC = "readi:isPublic";
export const ROLES = "readi:roles";
export const SERVICE_ONLY = "readi:serviceOnly";

/** Opts a route out of the global default-deny auth guard. Use sparingly; every use is reviewed. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * The AI worker's own routes: no user session, the shared service token instead (`ServiceTokenGuard`).
 *
 * Not the same thing as `@Public()` and deliberately a separate marker. A `@ServiceOnly()` route is
 * **more** restricted than a signed-in one, not less — no candidate can reach it — and the two guards
 * read the two markers, so neither can be satisfied by the other's mistake. It is the second
 * direction of authentication ADR-0019 introduced, and every use is `/api/internal/...`.
 */
export const ServiceOnly = () => SetMetadata(SERVICE_ONLY, true);

/** Restricts a route to the given roles (the user must also be signed in). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** The signed-in user, attached by AuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user) throw new Error("CurrentUser used on a route without an authenticated user");
    return request.user;
  },
);

/** The current session (user, id and when it was created), attached by AuthGuard. */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthSession => {
    const request = context.switchToHttp().getRequest<{ authSession?: AuthSession }>();
    if (!request.authSession) {
      throw new Error("CurrentSession used on a route without an authenticated user");
    }
    return request.authSession;
  },
);
