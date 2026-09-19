import { PASSWORD_LIMITS } from "@readi/shared-types/constants";
import { t } from "@/i18n";

/** The parts of a Better Auth client error we rely on. */
export interface AuthErrorLike {
  status?: number;
  code?: string;
}

export type AuthErrorField = "email" | "password" | "phoneNumber" | "code";

/** Translated copy for a Better Auth error, and the form field it belongs to (if any). */
export function describeAuthError(error: AuthErrorLike | null | undefined): {
  message: string;
  field?: AuthErrorField;
} {
  if (error?.status === 0) return { message: t("common.errors.network") };
  if (error?.status === 429) return { message: t("common.errors.rateLimited") };
  switch (error?.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return { message: t("auth.errors.invalidCredentials") };
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return { message: t("auth.errors.userExists"), field: "email" };
    case "INVALID_EMAIL":
      return { message: t("auth.errors.invalidEmail"), field: "email" };
    case "PASSWORD_TOO_SHORT":
      return {
        message: t("auth.errors.passwordTooShort", { min: PASSWORD_LIMITS.minLength }),
        field: "password",
      };
    case "PASSWORD_TOO_LONG":
      return {
        message: t("auth.errors.passwordTooLong", { max: PASSWORD_LIMITS.maxLength }),
        field: "password",
      };
    case "INVALID_PHONE_NUMBER":
      return { message: t("auth.errors.invalidPhone"), field: "phoneNumber" };
    case "INVALID_OTP":
      return { message: t("auth.errors.invalidOtp"), field: "code" };
    case "OTP_EXPIRED":
    case "OTP_NOT_FOUND":
      return { message: t("auth.errors.otpExpired"), field: "code" };
    case "TOO_MANY_ATTEMPTS":
      return { message: t("auth.errors.tooManyAttempts"), field: "code" };
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return { message: t("auth.errors.invalidToken") };
    default:
      return { message: t("common.errors.generic") };
  }
}

/** Runs a Better Auth client call; a network failure becomes an error with status 0. */
export async function runAuth<T>(
  call: () => Promise<{ data: T | null; error: AuthErrorLike | null }>,
): Promise<{ data: T | null; error: AuthErrorLike | null }> {
  try {
    return await call();
  } catch {
    return { data: null, error: { status: 0 } };
  }
}
