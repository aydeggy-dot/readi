import type { Metadata } from "next";
import { PageHeading } from "@/components/layout/page-heading";
import { ProfileForm } from "@/components/onboarding/profile-form";
import { t } from "@/i18n";
import { getCareerRoles, getProfile, todayIsoDate } from "@/lib/profile-data";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: t("profile.editTitle") };

export default async function EditProfilePage() {
  const me = await requireOnboarded();
  const [profile, roles] = await Promise.all([getProfile(), getCareerRoles()]);

  return (
    <>
      <PageHeading title={t("profile.editTitle")} />
      <ProfileForm
        initial={profile}
        name={me.name}
        mode="edit"
        today={todayIsoDate()}
        roles={roles}
      />
    </>
  );
}
