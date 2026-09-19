import type { IncomingHttpHeaders } from "node:http";
import { Inject, Injectable } from "@nestjs/common";
import { Role, SignupMethod } from "@readi/shared-types";
import { fromNodeHeaders } from "better-auth/node";
import { PrismaService } from "../prisma/prisma.service";
import { type AuthSession, AuthService } from "./auth.service";
import { BETTER_AUTH, type BetterAuthInstance } from "./better-auth.factory";
import { isPlaceholderEmail } from "./phone";

/** AuthService backed by Better Auth. The only class outside auth wiring that touches Better Auth. */
@Injectable()
export class BetterAuthService extends AuthService {
  constructor(
    @Inject(BETTER_AUTH) private readonly auth: BetterAuthInstance,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const result = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!result) return null;
    const { user, session } = result;
    return {
      sessionId: session.id,
      createdAt: new Date(session.createdAt),
      user: {
        id: user.id,
        name: user.name,
        // Stored values are validated rather than trusted: an unknown role is treated as no access.
        role: Role.parse(user.role),
        email: isPlaceholderEmail(user.email) ? null : user.email,
        emailVerified: user.emailVerified,
        phoneNumber: user.phoneNumber ?? null,
        phoneNumberVerified: user.phoneNumberVerified ?? false,
        signupMethod: SignupMethod.parse(user.signupMethod),
      },
    };
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }
}
