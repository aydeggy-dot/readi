import type { Metadata } from "next";
import { EditorHeading } from "@/components/admin/editor-heading";
import { TrackForm } from "@/components/admin/track-form";
import { t } from "@/i18n";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.track.new") };

export default async function NewTrackPage() {
  await requireContentEditor();
  const api = await serverApi();
  const { data } = await api.GET("/api/admin/content/topics");
  return (
    <>
      <EditorHeading
        title={t("admin.content.track.new")}
        lead={t("admin.content.sections.tracksLead")}
        backHref="/admin/content/tracks"
      />
      <TrackForm track={null} topics={data?.topics ?? []} />
    </>
  );
}
