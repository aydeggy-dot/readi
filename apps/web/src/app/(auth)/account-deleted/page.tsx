import { ACCOUNT_DELETION } from "@readi/shared-types/constants";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { clientEnv } from "@/env/client";
import { formatDate, t } from "@/i18n";
import { isoDateParam } from "@/lib/navigation";

export const metadata: Metadata = { title: t("account.deleted.title") };

/** Shown after a deletion request; the user is already signed out (ADR-0011). */
export default async function AccountDeletedPage({ searchParams }: PageProps<"/account-deleted">) {
  const date = isoDateParam((await searchParams).on);

  return (
    <AuthCard title={t("account.deleted.title")}>
      <p>
        {date
          ? t("account.deleted.body", { date: formatDate(date) })
          : t("account.deleted.bodyNoDate", { days: ACCOUNT_DELETION.graceDays })}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("account.deleted.cancel", { email: clientEnv.supportEmail })}
      </p>
      <Button asChild variant="outline">
        <Link href="/">{t("account.deleted.home")}</Link>
      </Button>
    </AuthCard>
  );
}
