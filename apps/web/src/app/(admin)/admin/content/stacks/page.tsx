import type { Metadata } from "next";
import Link from "next/link";
import { ContentFilters, ContentRow, ContentRows, Pager } from "@/components/admin/content-list";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { contentListQuery, type SearchParams } from "@/lib/content-query";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.sections.stacks") };

const PATH = "/admin/content/stacks";

/** The variants a role is interviewed for (ADR-0015) — "Java / Spring", not "Java". */
export default async function StacksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireContentEditor();
  const query = contentListQuery(await searchParams);
  const api = await serverApi();
  const { data } = await api.GET("/api/admin/content/stacks", { params: { query } });
  if (!data) throw new Error("GET /api/admin/content/stacks failed");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          title={t("admin.content.sections.stacks")}
          lead={t("admin.content.sections.stacksLead")}
        />
        <Button asChild>
          <Link href={`${PATH}/new`}>{t("admin.content.actions.newStack")}</Link>
        </Button>
      </div>

      <ContentFilters action={PATH} query={query} fields={{ status: true }} />

      <ContentRows items={data.items} query={query}>
        {data.items.map((stack) => (
          <ContentRow
            key={stack.id}
            href={`${PATH}/${stack.id}`}
            title={stack.name}
            subtitle={stack.slug}
            status={stack.status}
            seedManaged={stack.seed_managed}
            aiDraftUnreviewed={stack.ai_draft_unreviewed}
            meta={[t("admin.content.list.usedByRoles", { count: stack.role_count })]}
            updatedAt={stack.updated_at}
          />
        ))}
      </ContentRows>
      <Pager pathname={PATH} query={query} nextCursor={data.next_cursor} />
    </>
  );
}
