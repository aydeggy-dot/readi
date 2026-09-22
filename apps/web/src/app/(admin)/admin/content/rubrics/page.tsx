import type { Metadata } from "next";
import Link from "next/link";
import { ContentFilters, ContentRow, ContentRows, Pager } from "@/components/admin/content-list";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { contentListQuery, type SearchParams } from "@/lib/content-query";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.sections.rubrics") };

const PATH = "/admin/content/rubrics";

export default async function RubricsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireContentEditor();
  const query = contentListQuery(await searchParams);
  const api = await serverApi();
  const { data } = await api.GET("/api/admin/content/rubrics", { params: { query } });
  if (!data) throw new Error("GET /api/admin/content/rubrics failed");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          title={t("admin.content.sections.rubrics")}
          lead={t("admin.content.sections.rubricsLead")}
        />
        <Button asChild>
          <Link href={`${PATH}/new`}>{t("admin.content.actions.newRubric")}</Link>
        </Button>
      </div>

      <ContentFilters action={PATH} query={query} fields={{ status: true }} />

      <ContentRows items={data.items} query={query}>
        {data.items.map((rubric) => (
          <ContentRow
            key={rubric.id}
            href={`${PATH}/${rubric.id}`}
            title={rubric.name}
            subtitle={rubric.slug}
            status={rubric.status}
            seedManaged={rubric.seed_managed}
            aiDraftUnreviewed={rubric.ai_draft_unreviewed}
            meta={[t("admin.content.list.criteria", { count: rubric.criteria_count })]}
            updatedAt={rubric.updated_at}
          />
        ))}
      </ContentRows>
      <Pager pathname={PATH} query={query} nextCursor={data.next_cursor} />
    </>
  );
}
