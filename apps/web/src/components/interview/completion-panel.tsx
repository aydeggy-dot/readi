"use client";

import type { InterviewSessionResponse, InterviewStatusResponse } from "@readi/shared-types";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
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
 * What a candidate sees when the interview ends (the owner's decision, 2026-09-22): the real
 * processing screen — polled, in the `cv-panel.tsx` shape — above the full transcript.
 *
 * **It does not spin for something that is not coming.** M3 scores nothing, so `feedback_ready` is
 * always false and the screen says plainly that scoring is not built yet. The only thing it waits
 * for is the session settling, which is the case where the candidate arrives here a beat before the
 * last exchange has been written down. M4 makes `feedback_ready` true and puts the report beside
 * this, which is why the polling is here now rather than added then.
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
    refetchInterval: (query) =>
      query.state.data?.status === "in_progress" ? POLL_MS : (false as const),
  });

  const settling = status.status === "in_progress";

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
            : t("interview.complete.lead", {
                asked,
                budget: session.question_budget,
                // What it took, not what was on offer.
                minutes: elapsedMinutes(session.started_at, status.ended_at, clock),
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

      {/* Honest, and in the mentor's own voice: the work is kept, the scoring is not written yet. */}
      <section className="flex flex-col gap-3 rounded-lg border border-frame bg-card p-5 sm:p-6">
        <h2 className="text-2xl leading-tight">{t("interview.complete.scoringTitle")}</h2>
        <p className="text-lg leading-relaxed">{t("interview.complete.scoring")}</p>
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
