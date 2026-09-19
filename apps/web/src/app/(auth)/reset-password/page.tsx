import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/password-reset-forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("auth.reset.title") };

// The emailed link goes through the API, which redirects here with ?token=… or ?error=INVALID_TOKEN.
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;
  const valid = typeof token === "string" && token.length > 0 && error === undefined;

  return (
    <AuthCard title={t("auth.reset.title")}>
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <>
          <Alert variant="error">{t("auth.reset.invalid")}</Alert>
          <Button asChild variant="outline">
            <Link href="/forgot-password">{t("auth.reset.requestNew")}</Link>
          </Button>
        </>
      )}
    </AuthCard>
  );
}
