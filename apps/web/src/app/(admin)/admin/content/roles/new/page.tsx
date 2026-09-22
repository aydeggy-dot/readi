import type { Metadata } from "next";
import { CareerRoleForm } from "@/components/admin/career-role-form";
import { EditorHeading } from "@/components/admin/editor-heading";
import { Note } from "@/components/ui/margin";
import { t } from "@/i18n";
import { requireContentEditor } from "@/lib/session";
import { catalogueChoices } from "@/lib/catalogue-choices";

export const metadata: Metadata = { title: t("admin.content.actions.newRole") };

export default async function NewRolePage() {
  await requireContentEditor();
  const { levels, stacks, capped } = await catalogueChoices();

  return (
    <>
      <EditorHeading
        title={t("admin.content.actions.newRole")}
        lead={t("admin.content.sections.rolesLead")}
        backHref="/admin/content/roles"
      />
      {capped && (
        <Note as="aside">{t("admin.content.role.catalogueCapped", { count: capped })}</Note>
      )}
      <CareerRoleForm role={null} levels={levels} stacks={stacks} />
    </>
  );
}
