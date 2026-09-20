import type { Metadata } from "next";
import { ProfileForm } from "@/components/onboarding/profile-form";
import { t } from "@/i18n";
import { getProfile, todayIsoDate } from "@/lib/profile-data";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: t("profile.editTitle") };

export default async function EditProfilePage() {
  const me = await requireOnboarded();
  const profile = await getProfile();

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{t("profile.editTitle")}</h1>
      <ProfileForm initial={profile} name={me.name} mode="edit" today={todayIsoDate()} />
    </>
  );
}
