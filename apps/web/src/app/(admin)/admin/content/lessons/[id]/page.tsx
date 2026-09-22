import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorHeading } from "@/components/admin/editor-heading";
import { LessonForm } from "@/components/admin/lesson-form";
import { ReviewPanel } from "@/components/admin/review-panel";
import { TransitionPanel } from "@/components/admin/transition-panel";
import { VersionHistory } from "@/components/admin/version-history";
import { t } from "@/i18n";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.sections.lessons") };

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireContentEditor();
  const { id } = await params;
  const api = await serverApi();
  const [lesson, topics] = await Promise.all([
    api.GET("/api/admin/content/lessons/{id}", { params: { path: { id } } }),
    api.GET("/api/admin/content/topics"),
  ]);
  if (!lesson.data) notFound();

  return (
    <>
      <EditorHeading
        title={lesson.data.title}
        lead={lesson.data.slug}
        backHref="/admin/content/lessons"
        status={lesson.data.status}
        seedManaged={lesson.data.seed_managed}
        aiDraftUnreviewed={lesson.data.ai_draft_unreviewed}
      />
      <LessonForm lesson={lesson.data} topics={topics.data?.topics ?? []} />
      <ReviewPanel
        entity="lessons"
        id={lesson.data.id}
        aiDraftUnreviewed={lesson.data.ai_draft_unreviewed}
        reviewedAt={lesson.data.reviewed_at}
      />
      <TransitionPanel
        entity="lessons"
        id={lesson.data.id}
        status={lesson.data.status}
        role={me.role}
      />
      <VersionHistory entity="lessons" id={lesson.data.id} version={lesson.data.version} />
    </>
  );
}
