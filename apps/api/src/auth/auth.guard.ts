import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@readi/shared-types";
import { IS_PUBLIC, ROLES, SERVICE_ONLY } from "./auth.decorators";
import { type AuthenticatedUser, type AuthSession, AuthService } from "./auth.service";

/**
 * Global default-deny guard: every route needs a signed-in user unless marked @Public(), and
 * @Roles() further restricts it. (/api/auth/* is Better Auth's own handler and does not pass here.)
 *
 * `@ServiceOnly()` routes are the one other exception, and they are not a hole: `ServiceTokenGuard`
 * is a second global guard that demands the worker's service token on exactly those routes. Between
 * them the two guards cover every route, and a route carrying neither marker is still refused here.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    // Authenticated by `ServiceTokenGuard` instead: there is no user to resolve, and asking Better
    // Auth to resolve one from a service token's header would answer null and refuse the worker.
    if (this.reflector.getAllAndOverride<boolean>(SERVICE_ONLY, targets)) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
      authSession?: AuthSession;
    }>();
    const session = await this.auth.getSession(request.headers);
    if (!session) throw new UnauthorizedException();
    request.user = session.user;
    request.authSession = session;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles && roles.length > 0 && !roles.includes(session.user.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
