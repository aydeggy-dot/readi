import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorHeading } from "@/components/admin/editor-heading";
import { RubricForm } from "@/components/admin/rubric-form";
import { TransitionPanel } from "@/components/admin/transition-panel";
import { VersionHistory } from "@/components/admin/version-history";
import { t } from "@/i18n";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.sections.rubrics") };

export default async function RubricPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireContentEditor();
  const { id } = await params;
  const api = await serverApi();
  const { data } = await api.GET("/api/admin/content/rubrics/{id}", { params: { path: { id } } });
  if (!data) notFound();

  return (
    <>
      <EditorHeading
        title={data.name}
        lead={data.slug}
        backHref="/admin/content/rubrics"
        status={data.status}
        seedManaged={data.seed_managed}
      />
      <RubricForm rubric={data} />
      <TransitionPanel entity="rubrics" id={data.id} status={data.status} role={me.role} />
      <VersionHistory entity="rubrics" id={data.id} />
    </>
  );
}
