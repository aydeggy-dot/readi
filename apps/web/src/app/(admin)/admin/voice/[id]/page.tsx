import type { VoiceTurnLatency } from "@readi/shared-types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { Note } from "@/components/ui/margin";
import { TextLink } from "@/components/ui/text-link";
import { formatDay, t } from "@/i18n";
import { requireAdmin, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.voice.session.title") };

/**
 * One voice session, turn by turn — because a p50 that misses the target cannot say **why**.
 *
 * That is the whole reason this page exists beside the list: a response time with a large coverage
 * call and no phrasing call is a different problem from one with both, and a different lever fixes it
 * (ADR-0019 §5 — levers 3 and 4 are phase 8 decisions with measurements in front of them). The rows
 * here are what those measurements are read off.
 *
 * Every stage is its own line rather than a column, at 360px first, and an absent stage is a dash: no
 * `coverage_ms` means the engine had no probe left worth judging, no `phrasing_ms` means the opening
 * was prefetched during the previous answer, no `tts_first_byte_ms` means the audio was already
 * rendered. None of those is a zero.
 */
export default async function VoiceSessionLatencyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const api = await serverApi();
  const { data } = await api.GET("/api/admin/voice/latency/{id}", { params: { path: { id } } });
  if (!data) notFound();

  const { session, targets, turns } = data;
  return (
    <>
      <PageHeading
        title={t("admin.voice.session.title")}
        lead={t("admin.voice.session.lead", {
          started: formatDay(session.started_at),
          minutes: (session.voice_seconds / 60).toFixed(1),
        })}
      />
      <p className="text-base">
        <TextLink href="/admin/voice">{t("admin.voice.back")}</TextLink>
      </p>
      <Note as="aside">
        {t("admin.voice.targets", {
          firstAudio: String(targets.first_audio_ms),
          response: String(targets.response_ms),
        })}
      </Note>

      <section className="flex flex-col gap-4 border-t border-frame pt-6">
        <h2 className="text-xl leading-tight">{t("admin.voice.session.legs")}</h2>
        {session.legs.length === 0 ? (
          <p className="text-base text-muted-foreground">{t("admin.voice.session.noLegs")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-frame">
            {session.legs.map((leg) => (
              <li key={leg.leg_id} className="flex flex-col gap-0.5 py-3 first:pt-0">
                <span className="text-lg">{leg.reason}</span>
                <span className="text-base text-muted-foreground tabular-nums">
                  {t("admin.voice.session.leg", {
                    minutes: (leg.voice_seconds / 60).toFixed(1),
                    turns: String(leg.turns_spoken),
                    reconnects: String(leg.quality.reconnects),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-frame pt-6">
        <h2 className="text-xl leading-tight">{t("admin.voice.session.turns")}</h2>
        {turns.length === 0 ? (
          <p className="text-base text-muted-foreground">{t("admin.voice.session.noTurns")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-frame">
            {turns.map((turn) => (
              <Turn key={turn.turn_seq} turn={turn} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Turn({ turn }: { turn: VoiceTurnLatency }) {
  return (
    <li className="flex flex-col gap-2 py-4 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-lg tabular-nums">#{turn.turn_seq}</span>
        <span className="text-base text-muted-foreground">
          {new Date(turn.speech_ended_at).toISOString().slice(11, 19)}
        </span>
        {turn.prefetched && (
          <span className="text-base text-muted-foreground">{t("admin.voice.prefetchedTag")}</span>
        )}
        {turn.interrupted && (
          <span className="text-base text-muted-foreground">{t("admin.voice.interruptedTag")}</span>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Cell label={t("admin.voice.endpoint")} value={turn.endpoint_ms} />
        <Cell label={t("admin.voice.sttFinal")} value={turn.stt_final_ms} />
        <Cell label={t("admin.voice.firstAudio")} value={turn.acknowledged_ms} />
        <Cell label={t("admin.voice.coverage")} value={turn.coverage_ms} />
        <Cell label={t("admin.voice.phrasing")} value={turn.phrasing_ms} />
        <Cell label={t("admin.voice.ttsFirstByte")} value={turn.tts_first_byte_ms} />
        <Cell label={t("admin.voice.response")} value={turn.response_ms} />
      </dl>
    </li>
  );
}

function Cell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-base text-muted-foreground">{label}</dt>
      <dd className="text-lg tabular-nums">{value === null ? "—" : `${value} ms`}</dd>
    </div>
  );
}
