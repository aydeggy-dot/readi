import { ACCOUNT_DELETION, DATA_EXPORT_CV_LINK_MINUTES } from "@readi/shared-types/constants";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DeleteAccountForm } from "@/components/account/delete-account-form";
import { ExportDataButton } from "@/components/account/export-data-button";
import { clientEnv } from "@/env/client";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: t("account.title") };

/** Data export and account deletion (ADR-0011). Onboarding need not be finished to leave. */
export default async function AccountPage() {
  await requireUser();
  const days = ACCOUNT_DELETION.graceDays;

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("account.title")}</h1>
        <p className="text-muted-foreground">{t("account.subtitle")}</p>
      </div>

      <Section id="export" title={t("account.export.title")}>
        <p>{t("account.export.body")}</p>
        <p className="text-sm text-muted-foreground">
          {t("account.export.cvLink", { minutes: DATA_EXPORT_CV_LINK_MINUTES })}
        </p>
        <ExportDataButton />
      </Section>

      <Section id="delete" title={t("account.delete.title")} danger>
        <p>
          {t("account.delete.body", { days })} {t("account.delete.noSignIn", { days })}
        </p>
        <p className="text-sm text-muted-foreground">{t("account.delete.kept")}</p>
        <p className="text-sm text-muted-foreground">
          {t("account.delete.cancel", { email: clientEnv.supportEmail, days })}{" "}
          {t("account.delete.exportFirst")}
        </p>
        <DeleteAccountForm />
      </Section>
    </>
  );
}

function Section({
  id,
  title,
  danger = false,
  children,
}: {
  id: string;
  title: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn("flex flex-col rounded-lg border", danger && "border-destructive/50")}
    >
      <h2 id={`${id}-title`} className="border-b px-4 py-2 font-semibold">
        {title}
      </h2>
      <div className="flex flex-col gap-3 px-4 py-4">{children}</div>
    </section>
  );
}
