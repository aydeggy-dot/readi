import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsentForm } from "@/components/onboarding/consent-form";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { t } from "@/i18n";
import { getConsents } from "@/lib/profile-data";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: t("onboarding.consent.title") };

export default async function OnboardingConsentPage() {
  const me = await requireUser();
  if (me.onboarding.completed_at) redirect("/profile/consent");
  if (!me.onboarding.profile_completed) redirect("/onboarding/profile");
  const consents = await getConsents();

  return (
    <>
      <OnboardingSteps current="consent" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("onboarding.consent.title")}</h1>
        <p className="text-muted-foreground">{t("onboarding.consent.subtitle")}</p>
      </div>
      <ConsentForm consents={consents} mode="onboarding" />
    </>
  );
}
