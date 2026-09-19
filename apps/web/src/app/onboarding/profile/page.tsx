import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("onboarding.profile.title")}</h1>
        <p className="text-muted-foreground">{t("onboarding.profile.subtitle")}</p>
      </div>
      <ProfileForm initial={profile} name={me.name} mode="onboarding" today={todayIsoDate()} />
    </>
  );
}
