import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogueForm } from "@/components/admin/catalogue-form";
import { EditorHeading } from "@/components/admin/editor-heading";
import { ReviewPanel } from "@/components/admin/review-panel";
import { TransitionPanel } from "@/components/admin/transition-panel";
import { VersionHistory } from "@/components/admin/version-history";
import { t } from "@/i18n";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.sections.levels") };

export default async function LevelPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireContentEditor();
  const { id } = await params;
  const api = await serverApi();
  const { data } = await api.GET("/api/admin/content/career-levels/{id}", {
    params: { path: { id } },
  });
  if (!data) notFound();

  return (
    <>
      <EditorHeading
        title={data.name}
        lead={data.slug}
        backHref="/admin/content/levels"
        status={data.status}
        seedManaged={data.seed_managed}
        aiDraftUnreviewed={data.ai_draft_unreviewed}
      />
      <CatalogueForm
        kind="career-levels"
        entry={data}
        readOnly={data.status === "published" && me.role !== "admin"}
      />
      <ReviewPanel
        entity="career-levels"
        id={data.id}
        aiDraftUnreviewed={data.ai_draft_unreviewed}
        reviewedAt={data.reviewed_at}
      />
      <TransitionPanel entity="career-levels" id={data.id} status={data.status} role={me.role} />
      <VersionHistory entity="career-levels" id={data.id} version={data.version} />
    </>
  );
}
