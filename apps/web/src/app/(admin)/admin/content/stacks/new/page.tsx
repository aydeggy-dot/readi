import type { Metadata } from "next";
import { CatalogueForm } from "@/components/admin/catalogue-form";
import { EditorHeading } from "@/components/admin/editor-heading";
import { t } from "@/i18n";
import { requireContentEditor } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.actions.newStack") };

export default async function NewStackPage() {
  await requireContentEditor();
  return (
    <>
      <EditorHeading
        title={t("admin.content.actions.newStack")}
        lead={t("admin.content.sections.stacksLead")}
        backHref="/admin/content/stacks"
      />
      <CatalogueForm kind="stacks" entry={null} />
    </>
  );
}
