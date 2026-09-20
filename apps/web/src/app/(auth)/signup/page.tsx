import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { EmailPasswordForm } from "@/components/auth/email-password-form";
import { OtherMethods } from "@/components/auth/other-methods";
import { Note } from "@/components/ui/margin";
import { TextLink } from "@/components/ui/text-link";
import { t } from "@/i18n";
import { getAuthMethods } from "@/lib/auth-methods";
import { HOME_PATH } from "@/lib/navigation";
import { getMe } from "@/lib/session";

export const metadata: Metadata = { title: t("auth.signup.title") };

export default async function SignupPage() {
  if (await getMe()) redirect(HOME_PATH);
  const methods = await getAuthMethods();

  return (
    <AuthCard
      title={t("auth.signup.title")}
      subtitle={t("auth.signup.subtitle")}
      aside={
        <>
          <Note>{t("auth.signup.noteNext")}</Note>
          <Note>{t("auth.signup.notePrivacy")}</Note>
        </>
      }
    >
      <EmailPasswordForm mode="signup" next={HOME_PATH} />
      <OtherMethods current="email" google={methods.google} next={HOME_PATH} />
      <p className="text-base text-muted-foreground">
        {t("auth.signup.haveAccount")}{" "}
        <TextLink href="/login">{t("auth.signup.loginLink")}</TextLink>
      </p>
    </AuthCard>
  );
}
