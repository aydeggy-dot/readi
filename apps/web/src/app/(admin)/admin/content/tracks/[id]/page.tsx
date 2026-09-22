import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorHeading } from "@/components/admin/editor-heading";
import { ModulePanel } from "@/components/admin/module-panel";
import { TrackForm } from "@/components/admin/track-form";
import { ReviewPanel } from "@/components/admin/review-panel";
import { TransitionPanel } from "@/components/admin/transition-panel";
import { VersionHistory } from "@/components/admin/version-history";
import { t } from "@/i18n";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.sections.tracks") };

export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireContentEditor();
  const { id } = await params;
  const api = await serverApi();
  const [track, topics] = await Promise.all([
    api.GET("/api/admin/content/tracks/{id}", { params: { path: { id } } }),
    api.GET("/api/admin/content/topics"),
  ]);
  if (!track.data) notFound();

  return (
    <>
      <EditorHeading
        title={track.data.title}
        lead={`${t(`targetRoles.${track.data.role}`)} · ${t(`levels.${track.data.level}`)}`}
        backHref="/admin/content/tracks"
        status={track.data.status}
        seedManaged={track.data.seed_managed}
        aiDraftUnreviewed={track.data.ai_draft_unreviewed}
      />
      <TrackForm
        track={track.data}
        topics={topics.data?.topics ?? []}
        readOnly={track.data.status === "published" && me.role !== "admin"}
      />
      <ModulePanel
        track={track.data}
        topics={topics.data?.topics ?? []}
        readOnly={track.data.status === "published" && me.role !== "admin"}
      />
      <ReviewPanel
        entity="tracks"
        id={track.data.id}
        aiDraftUnreviewed={track.data.ai_draft_unreviewed}
        reviewedAt={track.data.reviewed_at}
      />
      <TransitionPanel
        entity="tracks"
        id={track.data.id}
        status={track.data.status}
        role={me.role}
      />
      <VersionHistory entity="tracks" id={track.data.id} version={track.data.version} />
    </>
  );
}
