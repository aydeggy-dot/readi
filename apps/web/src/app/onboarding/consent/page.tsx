import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsentForm } from "@/components/onboarding/consent-form";
import { PageHeading } from "@/components/layout/page-heading";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { t } from "@/i18n";
import { consentStepPath } from "@/lib/navigation";
import { getConsents } from "@/lib/profile-data";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: t("onboarding.consent.title") };

/**
 * Consent, in onboarding — and **also the screen an existing account is sent back to** when a consent
 * type or a consent version it has never decided on appears (2026-09-27, ADR-0017's "asked once").
 * `requireUser` rather than `requireOnboarded`, because an onboarded account can legitimately be here.
 *
 * Where it sends somebody instead is `consentStepPath`, which is pure and shares its one fact with
 * `nextOnboardingPath` — the two used to read different ones, and `/profile/consent` bounces back
 * through `requireOnboarded`, so disagreement here is an infinite redirect rather than a wrong page.
 */
export default async function OnboardingConsentPage() {
  const me = await requireUser();
  const elsewhere = consentStepPath(me.onboarding);
  if (elsewhere) redirect(elsewhere);
  const consents = await getConsents();

  return (
    <>
      <OnboardingSteps current="consent" />
      <PageHeading title={t("onboarding.consent.title")} lead={t("onboarding.consent.subtitle")} />
      <ConsentForm consents={consents} mode="onboarding" />
    </>
  );
}
