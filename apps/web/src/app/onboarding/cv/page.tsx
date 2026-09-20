import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CvPanel } from "@/components/cv/cv-panel";
import { PageHeading } from "@/components/layout/page-heading";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { t } from "@/i18n";
import { getCv } from "@/lib/profile-data";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: t("onboarding.cv.title") };

export default async function OnboardingCvPage() {
  const me = await requireUser();
  if (me.onboarding.completed_at) redirect("/profile/cv");
  if (!me.onboarding.profile_completed) redirect("/onboarding/profile");
  const cv = await getCv();

  return (
    <>
      <OnboardingSteps current="cv" />
      <PageHeading title={t("onboarding.cv.title")} lead={t("onboarding.cv.subtitle")} />
      <CvPanel initial={cv} mode="onboarding" />
    </>
  );
}
