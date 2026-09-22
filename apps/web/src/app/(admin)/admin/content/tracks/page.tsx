import type { Metadata } from "next";
import Link from "next/link";
import { ContentFilters, ContentRow, ContentRows, Pager } from "@/components/admin/content-list";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { roleAndLevelChoices, slugNames } from "@/lib/catalogue-choices";
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
  const [tracks, catalogue] = await Promise.all([
    api.GET("/api/admin/content/tracks", { params: { query } }),
    roleAndLevelChoices(),
  ]);
  const data = tracks.data;
  if (!data) throw new Error("GET /api/admin/content/tracks failed");
  const roleName = slugNames(catalogue.roles);
  const levelName = slugNames(catalogue.levels);

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
        roles={catalogue.roles}
        levels={catalogue.levels}
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
              `${roleName(track.role)} · ${levelName(track.level)}`,
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
