import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CareerRoleForm } from "@/components/admin/career-role-form";
import { EditorHeading } from "@/components/admin/editor-heading";
import { ReviewPanel } from "@/components/admin/review-panel";
import { TransitionPanel } from "@/components/admin/transition-panel";
import { VersionHistory } from "@/components/admin/version-history";
import { Note } from "@/components/ui/margin";
import { t } from "@/i18n";
import { catalogueChoices } from "@/lib/catalogue-choices";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.sections.roles") };

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireContentEditor();
  const { id } = await params;
  const api = await serverApi();
  const [role, choices] = await Promise.all([
    api.GET("/api/admin/content/career-roles/{id}", { params: { path: { id } } }),
    catalogueChoices(),
  ]);
  if (!role.data) notFound();
  const data = role.data;

  return (
    <>
      <EditorHeading
        title={data.name}
        lead={data.slug}
        backHref="/admin/content/roles"
        status={data.status}
        seedManaged={data.seed_managed}
        aiDraftUnreviewed={data.ai_draft_unreviewed}
      />
      {choices.capped && (
        <Note as="aside">{t("admin.content.role.catalogueCapped", { count: choices.capped })}</Note>
      )}
      <CareerRoleForm
        role={data}
        levels={choices.levels}
        stacks={choices.stacks}
        readOnly={data.status === "published" && me.role !== "admin"}
      />
      <ReviewPanel
        entity="career-roles"
        id={data.id}
        aiDraftUnreviewed={data.ai_draft_unreviewed}
        reviewedAt={data.reviewed_at}
      />
      <TransitionPanel entity="career-roles" id={data.id} status={data.status} role={me.role} />
      <VersionHistory entity="career-roles" id={data.id} version={data.version} />
    </>
  );
}
