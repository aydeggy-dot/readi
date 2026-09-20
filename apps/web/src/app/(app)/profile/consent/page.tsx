import type { Metadata } from "next";
import { PageHeading } from "@/components/layout/page-heading";
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
      <PageHeading title={t("profile.consentTitle")} lead={t("onboarding.consent.subtitle")} />
      <ConsentForm consents={consents} mode="edit" />
    </>
  );
}
