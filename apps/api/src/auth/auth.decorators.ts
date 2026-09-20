import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Role } from "@readi/shared-types";
import type { AuthenticatedUser, AuthSession } from "./auth.service";

export const IS_PUBLIC = "readi:isPublic";
export const ROLES = "readi:roles";

/** Opts a route out of the global default-deny auth guard. Use sparingly; every use is reviewed. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

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
