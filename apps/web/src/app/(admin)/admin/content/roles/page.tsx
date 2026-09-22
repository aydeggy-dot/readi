import type { Metadata } from "next";
import Link from "next/link";
import { ContentFilters, ContentRow, ContentRows, Pager } from "@/components/admin/content-list";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { contentListQuery, type SearchParams } from "@/lib/content-query";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.sections.roles") };

const PATH = "/admin/content/roles";

/** The roles a candidate prepares for (ADR-0015). Content, not an enum: this list is the catalogue. */
export default async function RolesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireContentEditor();
  const query = contentListQuery(await searchParams);
  const api = await serverApi();
  const { data } = await api.GET("/api/admin/content/career-roles", { params: { query } });
  if (!data) throw new Error("GET /api/admin/content/career-roles failed");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          title={t("admin.content.sections.roles")}
          lead={t("admin.content.sections.rolesLead")}
        />
        <Button asChild>
          <Link href={`${PATH}/new`}>{t("admin.content.actions.newRole")}</Link>
        </Button>
      </div>

      <ContentFilters action={PATH} query={query} fields={{ status: true }} />

      <ContentRows items={data.items} query={query}>
        {data.items.map((role) => (
          <ContentRow
            key={role.id}
            href={`${PATH}/${role.id}`}
            title={role.name}
            subtitle={role.slug}
            status={role.status}
            seedManaged={role.seed_managed}
            aiDraftUnreviewed={role.ai_draft_unreviewed}
            meta={[
              t("admin.content.list.roleLevels", { count: role.level_count }),
              t("admin.content.list.roleStacks", { count: role.stack_count }),
            ]}
            updatedAt={role.updated_at}
          />
        ))}
      </ContentRows>
      <Pager pathname={PATH} query={query} nextCursor={data.next_cursor} />
    </>
  );
}
