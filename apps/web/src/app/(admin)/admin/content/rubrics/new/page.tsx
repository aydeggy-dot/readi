import type { Metadata } from "next";
import { EditorHeading } from "@/components/admin/editor-heading";
import { RubricForm } from "@/components/admin/rubric-form";
import { t } from "@/i18n";
import { requireContentEditor } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.rubric.new") };

export default async function NewRubricPage() {
  await requireContentEditor();
  return (
    <>
      <EditorHeading
        title={t("admin.content.rubric.new")}
        lead={t("admin.content.sections.rubricsLead")}
        backHref="/admin/content/rubrics"
      />
      <RubricForm rubric={null} />
    </>
  );
}
