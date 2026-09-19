import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { EmailPasswordForm } from "@/components/auth/email-password-form";
import { OtherMethods } from "@/components/auth/other-methods";
import { Alert } from "@/components/ui/alert";
import { t } from "@/i18n";
import { DELETION_PENDING, describeAuthError } from "@/lib/auth-errors";
import { getAuthMethods } from "@/lib/auth-methods";
import { safeNextPath } from "@/lib/navigation";
import { getMe } from "@/lib/session";

export const metadata: Metadata = { title: t("auth.login.title") };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  if (await getMe()) redirect(next);
  const methods = await getAuthMethods();
  // A failed Google sign-in returns `error=google` plus Better Auth's own code, if it has one.
  const errors = ([] as string[]).concat(params.error ?? []);
  const googleError = errors.includes(DELETION_PENDING)
    ? describeAuthError({ code: DELETION_PENDING }).message
    : t("auth.errors.google");

  return (
    <AuthCard title={t("auth.login.title")} subtitle={t("auth.login.subtitle")}>
      {errors.length > 0 && <Alert variant="error">{googleError}</Alert>}
      {params.reset === "1" && <Alert variant="success">{t("auth.reset.done")}</Alert>}
      <EmailPasswordForm mode="login" next={next} />
      <OtherMethods current="email" google={methods.google} next={next} />
      <p className="text-sm text-muted-foreground">
        {t("auth.login.noAccount")}{" "}
        <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
          {t("auth.login.signupLink")}
        </Link>
      </p>
    </AuthCard>
  );
}
