"use client";

import type { InterviewSessionResponse, InterviewStatusResponse } from "@readi/shared-types";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/margin";
import { t } from "@/i18n";
import { browserApi } from "@/lib/browser-api";
import { elapsedMinutes } from "@/lib/interview-clock";
import { useClock } from "@/lib/use-clock";
import { Transcript } from "./transcript";

const POLL_MS = 2_000;
/**
 * How long to keep polling for a report before saying so.
 *
 * Spec §8 asks for a report within 60 s of the session ending; three minutes is comfortably past that
 * and short enough that nobody watches a spinner wondering. **A screen that spins for ever is the
 * failure this bound exists to prevent** — beyond it the job has either died or is being retried with
 * backoff, and "come back in a few minutes" is both true and actionable, where a spinner is neither.
 */
const POLL_LIMIT_MS = 3 * 60 * 1_000;

/**
 * What a candidate sees when the interview ends (the owner's decision, 2026-09-22): the real
 * processing screen — polled, in the `cv-panel.tsx` shape — above the full transcript.
 *
 * **It does not spin for something that is not coming**, and there are three different things that
 * could mean, each with its own state rather than one shared spinner:
 *
 * - the session has not been written down yet, which is a candidate arriving here while an exchange
 *   is still in flight;
 * - it is being scored, which is the ordinary case and lasts seconds — `feedback_ready` turns true
 *   when there is a report to read, **including** one that says nothing could be scored, because a
 *   spinner is a worse answer than a report with a gap in it;
 * - nobody answered anything, so there will never be a report. That is known from the transcript
 *   without asking: no candidate turn, no score, and the screen says so instead of polling.
 *
 * It also **does not promise a study plan**: five of the eight role × level combinations have no
 * published track, so "here is your programme" would be a promise we could not keep.
 */
export function CompletionPanel({
  session,
  now,
}: {
  session: InterviewSessionResponse;
  /** The server's clock, for a session that has somehow not been closed yet. */
  now: number;
}) {
  const router = useRouter();
  const clock = useClock(now);
  /*
   * When this screen started waiting, filled on mount rather than during a render — reading the clock
   * in a render body is impure (`react-hooks/purity`, the rule `serverNow()` exists for). Mount time
   * rather than `ended_at`, deliberately: a candidate opening a week-old interview whose scoring was
   * lost waits the same three minutes as one who has just finished, because opening the report is
   * what queued it.
   */
  const startedWaiting = useRef<number | null>(null);
  const [scoringSlow, setScoringSlow] = useState(false);
  /*
   * Whether there is anything to score, decided from the transcript rather than by asking: a session
   * with no candidate turn gets no evaluation job and no report (`endedWithAnswers` in the API), so
   * polling for one would be waiting for something nobody is making. Declared before the query
   * because `refetchInterval` reads it and can be called while `useQuery` is still running.
   */
  const answered = session.turns.some((turn) => turn.speaker === "candidate");
  const { data: status } = useQuery({
    queryKey: ["interview", session.id, "status"],
    queryFn: async (): Promise<InterviewStatusResponse> => {
      const { data, response } = await browserApi.GET("/api/interviews/{id}/status", {
        params: { path: { id: session.id } },
      });
      if (!data) throw new Error(`GET the interview status failed with HTTP ${response.status}`);
      return data;
    },
    initialData: {
      id: session.id,
      state: session.state,
      status: session.status,
      ended_at: session.ended_at,
      feedback_ready: false,
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return POLL_MS;
      // Still being written down, or still being scored — and only until the bound below lapses,
      // because a page that polls for ever is how a spinner outlives the job behind it.
      if (data.status === "in_progress") return POLL_MS;
      if (data.feedback_ready || !answered || scoringSlow) return false as const;
      return POLL_MS;
    },
  });

  const settling = status.status === "in_progress";
  const scoring = !settling && answered && !status.feedback_ready;

  /*
   * The bound, owned here and read by the poll: when it lapses the copy has to change too, and the
   * poll stopping does not by itself re-render anything. The state is set from the timer rather than
   * from the effect body, which would be a cascading render (`react-hooks/set-state-in-effect`).
   */
  useEffect(() => {
    if (!scoring) return;
    startedWaiting.current ??= Date.now();
    const left = POLL_LIMIT_MS - (Date.now() - startedWaiting.current);
    const timer = setTimeout(() => setScoringSlow(true), Math.max(0, left));
    return () => clearTimeout(timer);
  }, [scoring]);

  /*
   * The transcript is server-rendered, so when the poll sees the session settle the page has to be
   * re-read to pick up the last turns. Only on the transition: `router.refresh()` on every poll
   * would refetch the whole page twice a second.
   */
  useEffect(() => {
    if (!settling && session.status === "in_progress") router.refresh();
  }, [settling, session.status, router]);

  const unfinished = status.status === "abandoned";
  const asked = session.questions.length;
  // What it took, not what was on offer. A candidate who ends early after forty seconds read
  // "in 1 minutes", which the screenshot review caught: one variant rather than a plural engine,
  // because this is the only counted noun in the product whose value can be one.
  const minutes = elapsedMinutes(session.started_at, status.ended_at, clock);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-[1.9rem] leading-tight sm:text-4xl">{t("interview.complete.title")}</h1>
        <p className="text-lg text-muted-foreground">
          {unfinished
            ? t("interview.complete.leadUnfinished", {
                asked,
                budget: session.question_budget,
              })
            : t(minutes === 1 ? "interview.complete.leadOneMinute" : "interview.complete.lead", {
                asked,
                budget: session.question_budget,
                minutes,
              })}
        </p>
      </div>

      {/*
        The session has not been written down yet — which in M3 means the candidate reached this page
        by hand while an interview was still running, because the screen only comes here after the
        `state` frame said the session was over. The way back in is offered rather than described.
      */}
      {settling && (
        <Alert className="flex flex-col items-start gap-3">
          <span className="flex items-center gap-3">
            <span
              aria-hidden
              className="size-4 shrink-0 rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin"
            />
            <span>{t("interview.complete.waiting")}</span>
          </span>
          <Button asChild variant="outline" size="sm">
            <Link href={`/interview/${session.id}`}>{t("interview.list.resume")}</Link>
          </Button>
        </Alert>
      )}

      {/*
        The report, in whichever of its three states this session is in. It is the first thing under
        the heading in every one of them, because it is what the candidate came here for.
      */}
      <section className="flex flex-col gap-3 rounded-lg border border-frame bg-card p-5 sm:p-6">
        {status.feedback_ready ? (
          <>
            <h2 className="text-2xl leading-tight">{t("interview.complete.readyTitle")}</h2>
            <p className="text-lg leading-relaxed">{t("interview.complete.ready")}</p>
            <Button asChild size="lg" className="mt-1 w-full sm:w-auto sm:self-start">
              <Link href={`/interview/${session.id}/report`}>
                {t("interview.complete.readReport")}
              </Link>
            </Button>
          </>
        ) : !answered ? (
          <>
            <h2 className="text-2xl leading-tight">{t("interview.complete.nothingTitle")}</h2>
            <p className="text-lg leading-relaxed">{t("interview.complete.nothing")}</p>
          </>
        ) : scoringSlow ? (
          <>
            <h2 className="text-2xl leading-tight">{t("interview.complete.scoringSlowTitle")}</h2>
            <p className="text-lg leading-relaxed">{t("interview.complete.scoringSlow")}</p>
          </>
        ) : (
          <>
            <h2 className="flex items-center gap-3 text-2xl leading-tight">
              <span
                aria-hidden
                className="size-4 shrink-0 rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin"
              />
              {t("interview.complete.scoringTitle")}
            </h2>
            <p className="text-lg leading-relaxed">{t("interview.complete.scoring")}</p>
          </>
        )}
      </section>

      {/*
        The same sentence the setup screen made before the interview, now in the past tense: which
        round this was, and which two it was not. A product that prepares one round out of three
        must not let a candidate walk away thinking it prepared three (product principle 1, and the
        owner's coding-round decision of 2026-09-25).
      */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl leading-tight">{t("interview.complete.scopeTitle")}</h2>
        <Note as="p">{t("interview.complete.scope")}</Note>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl leading-tight">{t("interview.complete.nextTitle")}</h2>
        <Note as="p">{t("interview.complete.next")}</Note>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/practice/new">{t("interview.complete.again")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
          <Link href="/practice">{t("interview.complete.practice")}</Link>
        </Button>
      </div>

      <section className="flex flex-col gap-6 border-t border-frame pt-6">
        <h2 className="text-xl leading-tight">{t("interview.complete.transcript")}</h2>
        {session.turns.length === 0 ? (
          <p className="text-base text-muted-foreground">{t("interview.complete.noTurns")}</p>
        ) : (
          <Transcript turns={session.turns} questions={session.questions} />
        )}
      </section>
    </div>
  );
}
