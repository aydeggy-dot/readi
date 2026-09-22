import type { Metadata } from "next";
import Link from "next/link";
import { ContentFilters, ContentRow, ContentRows, Pager } from "@/components/admin/content-list";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { contentListQuery, type SearchParams } from "@/lib/content-query";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.sections.tracks") };

const PATH = "/admin/content/tracks";

export default async function TracksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireContentEditor();
  const query = contentListQuery(await searchParams);
  const api = await serverApi();
  const { data } = await api.GET("/api/admin/content/tracks", { params: { query } });
  if (!data) throw new Error("GET /api/admin/content/tracks failed");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          title={t("admin.content.sections.tracks")}
          lead={t("admin.content.sections.tracksLead")}
        />
        <Button asChild>
          <Link href={`${PATH}/new`}>{t("admin.content.actions.newTrack")}</Link>
        </Button>
      </div>

      <ContentFilters
        action={PATH}
        query={query}
        fields={{ status: true, role: true, level: true }}
      />

      <ContentRows items={data.items} query={query}>
        {data.items.map((track) => (
          <ContentRow
            key={track.id}
            href={`${PATH}/${track.id}`}
            title={track.title}
            subtitle={track.slug}
            status={track.status}
            seedManaged={track.seed_managed}
            aiDraftUnreviewed={track.ai_draft_unreviewed}
            meta={[
              `${t(`targetRoles.${track.role}`)} · ${t(`levels.${track.level}`)}`,
              t("admin.content.list.modules", { count: track.module_count }),
            ]}
            updatedAt={track.updated_at}
          />
        ))}
      </ContentRows>
      <Pager pathname={PATH} query={query} nextCursor={data.next_cursor} />
    </>
  );
}
