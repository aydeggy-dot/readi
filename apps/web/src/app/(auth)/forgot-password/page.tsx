import type { Metadata } from "next";
import { TextLink } from "@/components/ui/text-link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/password-reset-forms";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("auth.forgot.title") };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title={t("auth.forgot.title")} subtitle={t("auth.forgot.subtitle")}>
      <ForgotPasswordForm />
      <TextLink href="/login" className="self-start text-base">
        {t("auth.forgot.back")}
      </TextLink>
    </AuthCard>
  );
}
