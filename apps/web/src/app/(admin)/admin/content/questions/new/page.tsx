import type { Metadata } from "next";
import { EditorHeading } from "@/components/admin/editor-heading";
import { QuestionForm } from "@/components/admin/question-form";
import { t } from "@/i18n";
import { roleAndLevelChoices, stackChoices } from "@/lib/catalogue-choices";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.question.new") };

export default async function NewQuestionPage() {
  await requireContentEditor();
  const api = await serverApi();
  const [topics, rubrics, catalogue, stacks] = await Promise.all([
    api.GET("/api/admin/content/topics"),
    api.GET("/api/admin/content/rubrics", { params: { query: { limit: 100 } } }),
    roleAndLevelChoices(),
    stackChoices(),
  ]);

  return (
    <>
      <EditorHeading
        title={t("admin.content.question.new")}
        lead={t("admin.content.sections.questionsLead")}
        backHref="/admin/content/questions"
      />
      <QuestionForm
        question={null}
        topics={topics.data?.topics ?? []}
        rubrics={rubrics.data?.items ?? []}
        roles={catalogue.roles}
        levels={catalogue.levels}
        stacks={stacks.stacks}
      />
    </>
  );
}
