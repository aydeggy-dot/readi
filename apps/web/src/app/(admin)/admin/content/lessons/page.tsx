import type { Metadata } from "next";
import { ContentFilters, ContentRow, ContentRows, Pager } from "@/components/admin/content-list";
import { PageHeading } from "@/components/layout/page-heading";
import { Note } from "@/components/ui/margin";
import { t } from "@/i18n";
import { contentListQuery, type SearchParams } from "@/lib/content-query";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.sections.lessons") };

const PATH = "/admin/content/lessons";

/** Lessons have no "new" button here: a lesson belongs to a module, so it is added from its track. */
export default async function LessonsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireContentEditor();
  const query = contentListQuery(await searchParams);
  const api = await serverApi();
  const [lessons, topics] = await Promise.all([
    api.GET("/api/admin/content/lessons", { params: { query } }),
    api.GET("/api/admin/content/topics"),
  ]);
  if (!lessons.data) throw new Error("GET /api/admin/content/lessons failed");

  return (
    <>
      <PageHeading
        title={t("admin.content.sections.lessons")}
        lead={t("admin.content.sections.lessonsLead")}
      />
      <Note as="aside">{t("admin.content.track.modulesHint")}</Note>

      <ContentFilters
        action={PATH}
        query={query}
        fields={{ status: true, topic: true }}
        topics={topics.data?.topics ?? []}
      />

      <ContentRows items={lessons.data.items} query={query}>
        {lessons.data.items.map((lesson) => (
          <ContentRow
            key={lesson.id}
            href={`${PATH}/${lesson.id}`}
            title={lesson.title}
            subtitle={lesson.slug}
            status={lesson.status}
            seedManaged={lesson.seed_managed}
            updatedAt={lesson.updated_at}
          />
        ))}
      </ContentRows>
      <Pager pathname={PATH} query={query} nextCursor={lessons.data.next_cursor} />
    </>
  );
}
