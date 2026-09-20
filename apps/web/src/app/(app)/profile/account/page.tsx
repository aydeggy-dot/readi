import { ACCOUNT_DELETION, DATA_EXPORT_CV_LINK_MINUTES } from "@readi/shared-types/constants";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DeleteAccountForm } from "@/components/account/delete-account-form";
import { ExportDataButton } from "@/components/account/export-data-button";
import { PageHeading } from "@/components/layout/page-heading";
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
      <PageHeading title={t("account.title")} lead={t("account.subtitle")} />

      <Section id="export" title={t("account.export.title")}>
        <p>{t("account.export.body")}</p>
        <p className="text-base text-muted-foreground">
          {t("account.export.cvLink", { minutes: DATA_EXPORT_CV_LINK_MINUTES })}
        </p>
        <ExportDataButton />
      </Section>

      <Section id="delete" title={t("account.delete.title")} danger>
        <p>
          {t("account.delete.body", { days })} {t("account.delete.noSignIn", { days })}
        </p>
        <p className="text-base text-muted-foreground">{t("account.delete.kept")}</p>
        <p className="text-base text-muted-foreground">
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
    // Leaving is a serious action, so the dangerous half keeps its own frame rather than a rule.
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        "flex flex-col",
        danger ? "rounded-lg border border-destructive/60 p-5" : "border-t border-frame pt-6",
      )}
    >
      <h2 id={`${id}-title`} className="text-xl leading-tight">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}
