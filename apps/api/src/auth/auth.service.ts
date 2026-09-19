import type { IncomingHttpHeaders } from "node:http";
import type { Role, SignupMethod } from "@readi/shared-types";

/** The signed-in user as the rest of the API sees it. Never exposes Better Auth types (ADR-0005). */
export interface AuthenticatedUser {
  id: string;
  /** Display name; empty until set in onboarding (phone sign-ups start without one). */
  name: string;
  role: Role;
  /** Null when the account only has a placeholder email (phone sign-up). */
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  signupMethod: SignupMethod;
}

export interface AuthSession {
  user: AuthenticatedUser;
  sessionId: string;
  /** When this session was created; used to require a recent sign-in for sensitive actions. */
  createdAt: Date;
}

/** Our auth boundary. Controllers, guards and services depend on this, not on Better Auth. */
export abstract class AuthService {
  abstract getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null>;
  abstract revokeAllSessions(userId: string): Promise<void>;
}
