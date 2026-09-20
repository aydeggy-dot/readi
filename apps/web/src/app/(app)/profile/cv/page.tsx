import type { Metadata } from "next";
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
      <h1 className="text-2xl font-bold tracking-tight">{t("cv.title")}</h1>
      <CvPanel initial={cv} mode="profile" />
    </>
  );
}
