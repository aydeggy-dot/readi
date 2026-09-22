import type { Metadata } from "next";
import Link from "next/link";
import { ContentFilters, ContentRow, ContentRows, Pager } from "@/components/admin/content-list";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { roleAndLevelChoices, slugNames, stackChoices } from "@/lib/catalogue-choices";
import { contentListQuery, type SearchParams } from "@/lib/content-query";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.sections.questions") };

const PATH = "/admin/content/questions";

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireContentEditor();
  const query = contentListQuery(await searchParams);
  const api = await serverApi();
  const [questions, topics, catalogue, stacks] = await Promise.all([
    api.GET("/api/admin/content/questions", { params: { query } }),
    api.GET("/api/admin/content/topics"),
    roleAndLevelChoices(),
    stackChoices(),
  ]);
  if (!questions.data) throw new Error("GET /api/admin/content/questions failed");
  const roleName = slugNames(catalogue.roles);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          title={t("admin.content.sections.questions")}
          lead={t("admin.content.sections.questionsLead")}
        />
        <Button asChild>
          <Link href={`${PATH}/new`}>{t("admin.content.actions.newQuestion")}</Link>
        </Button>
      </div>

      <ContentFilters
        action={PATH}
        query={query}
        fields={{ status: true, type: true, role: true, level: true, stack: true, topic: true }}
        topics={topics.data?.topics ?? []}
        roles={catalogue.roles}
        levels={catalogue.levels}
        stacks={stacks.stacks}
      />

      <ContentRows items={questions.data.items} query={query}>
        {questions.data.items.map((question) => (
          <ContentRow
            key={question.id}
            href={`${PATH}/${question.id}`}
            // A question has no title of its own, and the list contract deliberately carries no
            // prompt to use as one: a CMS list is read over shoulders.
            title={question.slug}
            subtitle={question.topic.name}
            status={question.status}
            seedManaged={question.seed_managed}
            aiDraftUnreviewed={question.ai_draft_unreviewed}
            meta={[
              t(`admin.content.question.types.${question.type}`),
              t("admin.content.list.difficulty", { value: question.difficulty }),
              question.roles.map(roleName).join(", "),
            ]}
            updatedAt={question.updated_at}
          />
        ))}
      </ContentRows>
      <Pager pathname={PATH} query={query} nextCursor={questions.data.next_cursor} />
    </>
  );
}
