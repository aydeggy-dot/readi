import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CvPanel } from "@/components/cv/cv-panel";
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
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("onboarding.cv.title")}</h1>
        <p className="text-muted-foreground">{t("onboarding.cv.subtitle")}</p>
      </div>
      <CvPanel initial={cv} mode="onboarding" />
    </>
  );
}
