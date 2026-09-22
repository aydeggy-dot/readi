import type { Metadata } from "next";
import { CatalogueForm } from "@/components/admin/catalogue-form";
import { EditorHeading } from "@/components/admin/editor-heading";
import { t } from "@/i18n";
import { requireContentEditor } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.actions.newLevel") };

export default async function NewLevelPage() {
  await requireContentEditor();
  return (
    <>
      <EditorHeading
        title={t("admin.content.actions.newLevel")}
        lead={t("admin.content.sections.levelsLead")}
        backHref="/admin/content/levels"
      />
      <CatalogueForm kind="career-levels" entry={null} />
    </>
  );
}
