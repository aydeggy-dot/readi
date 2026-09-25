"use client";

import type {
  CandidateSessionQuestion,
  CandidateTurn,
  InterviewAction,
  InterviewSessionResponse,
  InterviewState,
  InterviewStatus,
} from "@readi/shared-types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { t } from "@/i18n";
import type { ApiFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import { frameFailure } from "@/lib/interview-errors";
import { advanceInterview } from "@/lib/interview-stream";
import { useDraft } from "@/lib/use-draft";
import { Composer } from "./composer";
import { ProgressStrip } from "./progress-strip";
import { Transcript } from "./transcript";

/**
 * How long a silent stream is allowed to be before the screen says so. Three heartbeats
 * (`INTERVIEW_SSE_HEARTBEAT_MS` is 15 s), which is the whole point of the heartbeat: without it
 * "still composing" and "we have lost you" look identical (ADR-0016).
 */
const STALL_MS = 45_000;

/**
 * How long to wait before reading the session again after `interview_busy`.
 *
 * Long enough for the exchange that holds the lock to finish an ordinary model call, short enough
 * that nobody is left looking at a screen that has not moved.
 */
const BUSY_RESYNC_MS = 3_000;

/** Where the session stands, as the `state` frame reports it. */
interface Live {
  state: InterviewState;
  status: InterviewStatus;
  endsAt: string;
  questionsAsked: number;
  questionBudget: number;
}

/**
 * The interview: one screen, one exchange at a time (ADR-0016).
 *
 * The page renders the transcript on the server and hands it over here; from then on every turn
 * arrives as a frame on the stream. **Whole turns, not tokens** — an AI call returns a complete
 * structured object, so there is no half-turn to animate, and what the stream buys is the composing
 * indicator appearing the instant the candidate presses send.
 *
 * Layout: the page scrolls, the progress strip sticks to the top and the composer to the bottom.
 * That is deliberately not an inner scroll container — on a mid-range Android phone the browser's
 * own scrolling and its handling of the on-screen keyboard are better than anything we would write,
 * and `flex-1` on the transcript keeps the composer at the bottom of the screen even when there are
 * only two lines above it.
 */
export function InterviewScreen({
  session,
  now,
}: {
  session: InterviewSessionResponse;
  /** The server's clock, so the first paint of the timer matches what the server rendered. */
  now: number;
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<CandidateTurn[]>(session.turns);
  const [questions, setQuestions] = useState<CandidateSessionQuestion[]>(session.questions);
  const [live, setLive] = useState<Live>({
    state: session.state,
    status: session.status,
    endsAt: session.ends_at,
    // Only questions the session has reached are served, so the count is the length (the primer §4).
    questionsAsked: session.questions.length,
    questionBudget: session.question_budget,
  });
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [failure, setFailure] = useState<ApiFailure>();
  // The draft lives in sessionStorage and is read from there, not mirrored into state (ADR-0013).
  const [draft, setDraft] = useDraft(`readi.interview.${session.id}.draft`);

  /**
   * The exchange in flight, or null. It is the one-at-a-time guard *and* the abort handle, and
   * those have to be the same thing: a separate boolean would survive an abort that cleared the
   * controller, and the screen would then refuse to start anything ever again.
   */
  const abort = useRef<AbortController | null>(null);
  const lastFrame = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  /**
   * Read the session again and adopt what it says.
   *
   * The recovery from `interview_busy`: another exchange is in flight — this screen's own previous
   * attempt, aborted by a remount, or the session open in a second tab — and whatever it produces
   * is written to the database whether or not anybody is listening to its stream. Doing nothing
   * would leave a candidate looking at a screen that never fills.
   */
  const resync = useCallback(async () => {
    const { data } = await browserApi.GET("/api/interviews/{id}", {
      params: { path: { id: session.id } },
    });
    if (!data) return;
    setTurns(data.turns);
    setQuestions(data.questions);
    setLive({
      state: data.state,
      status: data.status,
      endsAt: data.ends_at,
      questionsAsked: data.questions.length,
      questionBudget: data.question_budget,
    });
    if (data.status !== "in_progress") router.replace(`/interview/${session.id}/complete`);
  }, [router, session.id]);

  const run = useCallback(
    async (action: InterviewAction, text?: string) => {
      // One exchange at a time on this screen, as well as on the server: the API answers a second
      // one with `interview_busy`, and a double-tapped send button should not need an error at all.
      if (abort.current) return;
      const controller = new AbortController();
      abort.current = controller;
      setBusy(true);
      setThinking(true);
      setStalled(false);
      setFailure(undefined);
      lastFrame.current = Date.now();

      let finished = false;
      const outcome = await advanceInterview(
        session.id,
        { action, text },
        {
          signal: controller.signal,
          onFrame: (frame) => {
            lastFrame.current = Date.now();
            switch (frame.type) {
              case "thinking":
                setThinking(true);
                setStalled(false);
                break;
              case "question":
                // Idempotent, because a replayed exchange may send a question frame again.
                setQuestions((previous) =>
                  previous.some((entry) => entry.position === frame.question.position)
                    ? previous
                    : [...previous, frame.question],
                );
                break;
              case "turn":
                setTurns((previous) =>
                  previous.some((entry) => entry.seq === frame.turn.seq)
                    ? previous
                    : [...previous, frame.turn],
                );
                setThinking(false);
                break;
              case "state":
                setLive({
                  state: frame.state,
                  status: frame.status,
                  endsAt: frame.ends_at,
                  questionsAsked: frame.questions_asked,
                  questionBudget: frame.question_budget,
                });
                finished = frame.status !== "in_progress";
                break;
              case "error":
                setFailure(frameFailure(frame.code));
                break;
              case "done":
                setThinking(false);
                break;
            }
          },
        },
      );

      /*
       * The flags come down whatever happened. An exchange that was aborted while the screen stayed
       * mounted — a re-render that re-ran the effect, a Fast Refresh — would otherwise leave the
       * composer saying "Sending…" and the spinner turning for ever, which is what the first dark
       * mode capture caught. If the component has really gone, React ignores these.
       */
      const mine = abort.current === controller;
      if (mine) abort.current = null;
      setBusy(false);
      setThinking(false);
      setStalled(false);
      // Somebody else owns the screen now: an old answer must not arrive after a new question.
      if (!mine) return;

      if (outcome.kind === "stale") {
        router.replace(`/interview/${session.id}/complete`);
        return;
      }
      if (outcome.kind === "failed") setFailure(outcome.failure);
      /*
       * `busy` needs no error copy — nothing the candidate did was wrong — but it does need the
       * screen to catch up, because the exchange holding the lock is writing turns this client is
       * not listening to. `aborted` says nothing at all: they have left, and an exchange is
       * all-or-nothing, so nothing was lost.
       */
      if (outcome.kind === "busy") {
        setThinking(true);
        await new Promise((resolve) => setTimeout(resolve, BUSY_RESYNC_MS));
        await resync();
        setThinking(false);
        return;
      }
      if (finished) router.replace(`/interview/${session.id}/complete`);
    },
    [resync, router, session.id],
  );

  /*
   * A session with nothing said yet is one nobody has started, so the screen's first act is
   * `start`. It is also the retry path: an exchange stores nothing unless it completes, so a
   * failed start leaves a session with no turns and reloading simply tries again.
   *
   * Guarded by the session it started rather than by a boolean, so a re-render that re-runs this
   * effect does not start the interview twice — and cleared on unmount below, so the remount React
   * performs in development (and Fast Refresh, at will) *does* start it, having just aborted the
   * first attempt. Getting that wrong left a screen that had aborted its own start and would never
   * try again, which is what the first run in a browser showed.
   */
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (session.status !== "in_progress" || session.turns.length > 0) return;
    if (startedFor.current === session.id) return;
    startedFor.current = session.id;
    void run("start");
  }, [run, session.id, session.status, session.turns.length]);

  // A candidate who navigates away mid-exchange has lost nothing: an exchange is all-or-nothing,
  // and re-sending the same action replays it.
  useEffect(
    () => () => {
      abort.current?.abort();
      abort.current = null;
      startedFor.current = null;
    },
    [],
  );

  // "Still composing" and "we have lost you" look the same on screen unless we count the heartbeat.
  // Cleared where it was set, in `run`, so nothing in this effect's body touches state.
  useEffect(() => {
    if (!busy) return;
    const check = setInterval(() => {
      if (Date.now() - lastFrame.current > STALL_MS) setStalled(true);
    }, 5_000);
    return () => clearInterval(check);
  }, [busy]);

  // Keep the newest turn in view. Smoothly, unless the candidate has asked for less motion.
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    bottom.current?.scrollIntoView({ block: "end", behavior: reduced ? "auto" : "smooth" });
  }, [turns.length, thinking]);

  const answering =
    live.status === "in_progress" &&
    (live.state === "question" ||
      live.state === "follow_up" ||
      live.state === "candidate_questions");
  const over = live.state === "ended" || live.status !== "in_progress";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProgressStrip
        endsAt={live.endsAt}
        plannedMinutes={session.planned_minutes}
        questionsAsked={live.questionsAsked}
        questionBudget={live.questionBudget}
        now={now}
      />

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8">
        <Transcript turns={turns} questions={questions} />

        {thinking && <Thinking starting={turns.length === 0} stalled={stalled} />}
        {failure && <ErrorAlert failure={failure} />}

        {over && (
          <div className="flex flex-col items-start gap-3 border-t border-frame pt-6">
            <p className="font-serif text-xl text-heading">{t("interview.screen.ended")}</p>
            <Button asChild size="lg">
              <a href={`/interview/${session.id}/complete`}>{t("interview.screen.seeSummary")}</a>
            </Button>
          </div>
        )}

        <div ref={bottom} aria-hidden className="h-px" />
      </div>

      {answering && (
        <div className="sticky bottom-0 border-t border-frame bg-background">
          <div className="mx-auto w-full max-w-2xl px-5 pt-3 pb-4 sm:px-8">
            <Composer
              mode={live.state === "candidate_questions" ? "ask" : "answer"}
              busy={busy}
              value={draft}
              onChange={setDraft}
              onSend={(text) => void run("answer", text)}
              onSkip={() => void run("skip")}
              onEnd={() => void run("end")}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The interviewer is composing. The existing spinner idiom in a `role="status"` region — **never a
 * fake typing animation**, which would claim to show words being written that do not exist yet
 * (the whole exchange arrives at once).
 */
function Thinking({ starting, stalled }: { starting: boolean; stalled: boolean }) {
  return (
    <div role="status" className="flex flex-col gap-2">
      <p className="flex items-center gap-3 text-base text-muted-foreground">
        <span
          aria-hidden
          className="size-4 shrink-0 rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin"
        />
        <span>{starting ? t("interview.screen.starting") : t("interview.screen.thinking")}</span>
      </p>
      {stalled && <p className="text-base text-muted-foreground">{t("interview.screen.slow")}</p>}
    </div>
  );
}
