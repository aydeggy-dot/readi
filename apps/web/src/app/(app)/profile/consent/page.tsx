import type { Metadata } from "next";
import { ConsentForm } from "@/components/onboarding/consent-form";
import { t } from "@/i18n";
import { getConsents } from "@/lib/profile-data";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: t("profile.consentTitle") };

export default async function EditConsentPage() {
  await requireOnboarded();
  const consents = await getConsents();

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("profile.consentTitle")}</h1>
        <p className="text-muted-foreground">{t("onboarding.consent.subtitle")}</p>
      </div>
      <ConsentForm consents={consents} mode="edit" />
    </>
  );
}
