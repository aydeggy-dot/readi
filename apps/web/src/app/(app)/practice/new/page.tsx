import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SetupForm } from "@/components/interview/setup-form";
import { t } from "@/i18n";
import { getCareerRoles, getProfile } from "@/lib/profile-data";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: t("interview.setup.title") };

export default async function NewInterviewPage() {
  await requireOnboarded();
  const [profile, roles] = await Promise.all([getProfile(), getCareerRoles()]);
  // `requireOnboarded` has already established there is one; this is the belt to that braces.
  if (!profile) redirect("/onboarding/profile");

  return (
    <>
      <PageHeading title={t("interview.setup.title")} lead={t("interview.setup.lead")} />
      <SetupForm roles={roles} profile={profile} />
    </>
  );
}
