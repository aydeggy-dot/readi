import type { Metadata } from "next";
import Link from "next/link";
import { ContentFilters, ContentRow, ContentRows, Pager } from "@/components/admin/content-list";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { contentListQuery, type SearchParams } from "@/lib/content-query";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.sections.levels") };

const PATH = "/admin/content/levels";

/** The ladder (ADR-0015). Listed newest edit first like every other list, with the rank on the row. */
export default async function LevelsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireContentEditor();
  const query = contentListQuery(await searchParams);
  const api = await serverApi();
  const { data } = await api.GET("/api/admin/content/career-levels", { params: { query } });
  if (!data) throw new Error("GET /api/admin/content/career-levels failed");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          title={t("admin.content.sections.levels")}
          lead={t("admin.content.sections.levelsLead")}
        />
        <Button asChild>
          <Link href={`${PATH}/new`}>{t("admin.content.actions.newLevel")}</Link>
        </Button>
      </div>

      <ContentFilters action={PATH} query={query} fields={{ status: true }} />

      <ContentRows items={data.items} query={query}>
        {data.items.map((level) => (
          <ContentRow
            key={level.id}
            href={`${PATH}/${level.id}`}
            title={level.name}
            subtitle={level.slug}
            status={level.status}
            seedManaged={level.seed_managed}
            aiDraftUnreviewed={level.ai_draft_unreviewed}
            meta={[
              t("admin.content.list.rank", { value: level.rank }),
              t("admin.content.list.usedByRoles", { count: level.role_count }),
            ]}
            updatedAt={level.updated_at}
          />
        ))}
      </ContentRows>
      <Pager pathname={PATH} query={query} nextCursor={data.next_cursor} />
    </>
  );
}
