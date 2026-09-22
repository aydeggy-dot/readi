import type { Metadata } from "next";
import { TopicManager } from "@/components/admin/topic-manager";
import { PageHeading } from "@/components/layout/page-heading";
import { t } from "@/i18n";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.sections.topics") };

/** The whole taxonomy on one page: it is small by design, so it is not paged or filtered. */
export default async function TopicsPage() {
  await requireContentEditor();
  const api = await serverApi();
  const { data } = await api.GET("/api/admin/content/topics");
  if (!data) throw new Error("GET /api/admin/content/topics failed");

  return (
    <>
      <PageHeading
        title={t("admin.content.sections.topics")}
        lead={t("admin.content.sections.topicsLead")}
      />
      <TopicManager topics={data.topics} />
    </>
  );
}
