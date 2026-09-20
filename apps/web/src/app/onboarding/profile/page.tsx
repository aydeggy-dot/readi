import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { ProfileForm } from "@/components/onboarding/profile-form";
import { t } from "@/i18n";
import { getProfile, todayIsoDate } from "@/lib/profile-data";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: t("onboarding.profile.title") };

export default async function OnboardingProfilePage() {
  const me = await requireUser();
  if (me.onboarding.completed_at) redirect("/profile/edit");
  const profile = await getProfile();

  return (
    <>
      <OnboardingSteps current="profile" />
      <PageHeading title={t("onboarding.profile.title")} lead={t("onboarding.profile.subtitle")} />
      <ProfileForm initial={profile} name={me.name} mode="onboarding" today={todayIsoDate()} />
    </>
  );
}
