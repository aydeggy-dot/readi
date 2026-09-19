import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/password-reset-forms";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("auth.forgot.title") };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title={t("auth.forgot.title")} subtitle={t("auth.forgot.subtitle")}>
      <ForgotPasswordForm />
      <Link href="/login" className="self-start text-sm underline underline-offset-4">
        {t("auth.forgot.back")}
      </Link>
    </AuthCard>
  );
}
