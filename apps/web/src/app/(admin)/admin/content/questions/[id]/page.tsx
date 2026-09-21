import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorHeading } from "@/components/admin/editor-heading";
import { QuestionForm } from "@/components/admin/question-form";
import { TransitionPanel } from "@/components/admin/transition-panel";
import { VersionHistory } from "@/components/admin/version-history";
import { t } from "@/i18n";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.sections.questions") };

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireContentEditor();
  const { id } = await params;
  const api = await serverApi();
  const [question, topics, rubrics] = await Promise.all([
    api.GET("/api/admin/content/questions/{id}", { params: { path: { id } } }),
    api.GET("/api/admin/content/topics"),
    api.GET("/api/admin/content/rubrics", { params: { query: { limit: 100 } } }),
  ]);
  if (!question.data) notFound();

  return (
    <>
      <EditorHeading
        title={question.data.slug}
        lead={question.data.topic.name}
        backHref="/admin/content/questions"
        status={question.data.status}
        seedManaged={question.data.seed_managed}
      />
      <QuestionForm
        question={question.data}
        topics={topics.data?.topics ?? []}
        rubrics={rubrics.data?.items ?? []}
      />
      <TransitionPanel
        entity="questions"
        id={question.data.id}
        status={question.data.status}
        role={me.role}
      />
      <VersionHistory entity="questions" id={question.data.id} version={question.data.version} />
    </>
  );
}
