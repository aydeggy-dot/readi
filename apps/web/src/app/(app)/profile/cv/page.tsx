import type { Metadata } from "next";
import { PageHeading } from "@/components/layout/page-heading";
import { CvPanel } from "@/components/cv/cv-panel";
import { t } from "@/i18n";
import { getCv } from "@/lib/profile-data";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: t("cv.title") };

export default async function ProfileCvPage() {
  await requireOnboarded();
  const cv = await getCv();

  return (
    <>
      <PageHeading title={t("cv.title")} />
      <CvPanel initial={cv} mode="profile" />
    </>
  );
}
