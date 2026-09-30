import type { VoiceLatencySession, VoiceLatencySpread } from "@readi/shared-types";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/margin";
import { TextLink } from "@/components/ui/text-link";
import { formatDay, t } from "@/i18n";
import type { SearchParams } from "@/lib/content-query";
import { requireAdmin, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.voice.title") };

const PATH = "/admin/voice";

/**
 * Whether voice is meeting its latency budget (M5 phase 4, ADR-0019 §5).
 *
 * **Two numbers, not one.** Spec §8 asked for a voice turn under ~1 s and the stages cannot produce
 * it, so the target was amended to first audio under 250 ms — the interviewer acknowledging in its own
 * pre-rendered words — and the question or probe within 2.5 s. Both are served by the API from
 * `VOICE_LIMITS`, so this page cannot drift from the tests or from phase 8's report.
 *
 * **An `n` beside every figure, and a stage that did not happen shown as "—".** Most stages are
 * legitimately absent on most turns: the whole effect of latency lever 2 is that the phrasing call
 * **disappears** on a prefetched opening. A dash says that; a zero would say "instant".
 *
 * Rows, not a table, for the reason the calibration dashboard's note gives: a seven-column table put
 * the figure somebody came for off the right-hand edge at 360px.
 */
export default async function VoiceLatencyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const cursor = Array.isArray(params.cursor) ? params.cursor[0] : params.cursor;
  const api = await serverApi();
  const { data } = await api.GET("/api/admin/voice/latency", {
    params: { query: cursor ? { cursor } : {} },
  });
  if (!data) throw new Error("GET /api/admin/voice/latency failed");

  const { overall, targets } = data;
  return (
    <>
      <PageHeading title={t("admin.voice.title")} lead={t("admin.voice.lead")} />
      <Note as="aside">
        {t("admin.voice.targets", {
          firstAudio: String(targets.first_audio_ms),
          response: String(targets.response_ms),
        })}
      </Note>

      <dl className="grid grid-cols-2 gap-4 border-t border-frame pt-6 sm:grid-cols-4">
        <Tile label={t("admin.voice.sessions")} value={String(data.sessions.length)} />
        <Tile label={t("admin.voice.turns")} value={String(overall.turns)} />
        <Tile
          label={t("admin.voice.firstAudio")}
          value={ms(overall.first_audio.p50_ms)}
          note={within(overall.first_audio.p50_ms, targets.first_audio_ms)}
        />
        <Tile
          label={t("admin.voice.response")}
          value={ms(overall.response.p50_ms)}
          note={within(overall.response.p50_ms, targets.response_ms)}
        />
      </dl>

      {data.sessions.length === 0 ? (
        <Note as="aside" className="border-t border-frame pt-6">
          {t("admin.voice.empty")}
        </Note>
      ) : (
        <ul className="flex flex-col divide-y divide-frame border-t border-frame">
          {data.sessions.map((session) => (
            <Session key={session.session_id} session={session} />
          ))}
        </ul>
      )}

      {data.next_cursor && (
        <Button asChild variant="outline" className="self-start">
          <Link href={`${PATH}?cursor=${encodeURIComponent(data.next_cursor)}`}>
            {t("admin.content.list.more")}
          </Link>
        </Button>
      )}
    </>
  );
}

function Session({ session }: { session: VoiceLatencySession }) {
  const last = session.legs.at(-1);
  return (
    <li className="flex flex-col gap-2 py-4 first:pt-0">
      <div className="flex flex-col gap-0.5">
        <TextLink href={`${PATH}/${session.session_id}`} className="text-lg font-bold">
          {formatDay(session.started_at)}
        </TextLink>
        <p className="text-base text-muted-foreground">
          {t("admin.voice.sessionMeta", {
            state: session.state,
            status: session.status,
            minutes: minutes(session.voice_seconds),
          })}
          {last ? ` · ${last.reason}` : ""}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Figure label={t("admin.voice.firstAudio")} spread={session.latency.first_audio} />
        <Figure label={t("admin.voice.response")} spread={session.latency.response} />
        <Figure label={t("admin.voice.coverage")} spread={session.latency.coverage} />
        <Figure label={t("admin.voice.phrasing")} spread={session.latency.phrasing} />
      </dl>
      {/* The two facts about a session that are not latency but explain it. */}
      <p className="text-base text-muted-foreground">
        {t("admin.voice.counts", {
          prefetched: String(session.latency.prefetched),
          interrupted: String(session.latency.interrupted),
          reconnects: String(session.legs.reduce((all, leg) => all + leg.quality.reconnects, 0)),
        })}
        {session.fell_back_to_text ? ` · ${t("admin.voice.fellBack")}` : ""}
      </p>
    </li>
  );
}

function Figure({ label, spread }: { label: string; spread: VoiceLatencySpread }) {
  return (
    <div className="flex flex-col">
      <dt className="text-base text-muted-foreground">{label}</dt>
      <dd className="text-lg tabular-nums">{ms(spread.p50_ms)}</dd>
      {/* The sample size on the face of every stage: they differ, by design, and a p50 over three
          turns is not the same claim as a p50 over three hundred. */}
      <dd className="text-base text-muted-foreground tabular-nums">
        {t("admin.voice.n", { n: String(spread.n), p95: ms(spread.p95_ms) })}
      </dd>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-base text-muted-foreground">{label}</dt>
      <dd className="text-2xl tabular-nums">{value}</dd>
      {note && <dd className="text-base text-muted-foreground">{note}</dd>}
    </div>
  );
}

/** A stage that did not happen is a dash, never a zero: see the page's own note. */
const ms = (value: number | null) => (value === null ? "—" : `${value} ms`);
const minutes = (seconds: number) => (seconds / 60).toFixed(1);
/** Nothing measured yet is neither met nor missed, and saying "met" would be a claim. */
const within = (value: number | null, target: number) =>
  value === null ? undefined : value <= target ? t("admin.voice.met") : t("admin.voice.missed");
