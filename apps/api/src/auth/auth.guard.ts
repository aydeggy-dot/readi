import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@readi/shared-types";
import { IS_PUBLIC, ROLES } from "./auth.decorators";
import { type AuthenticatedUser, type AuthSession, AuthService } from "./auth.service";

/**
 * Global default-deny guard: every route needs a signed-in user unless marked @Public(), and
 * @Roles() further restricts it. (/api/auth/* is Better Auth's own handler and does not pass here.)
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
