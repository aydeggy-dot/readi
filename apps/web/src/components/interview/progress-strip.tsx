"use client";

import { t } from "@/i18n";
import { elapsedPercent, minutesLeft, timeLabel } from "@/lib/interview-clock";
import { useClock } from "@/lib/use-clock";

/**
 * Where the session stands, on the structural grey bar and above the fold always (ADR-0013).
 *
 * It carries **both a number and a label** — "Question 2 of 4" and "11 min left" — because colour
 * is never allowed to be the only signal, and a meter on its own is a colour. The meter tracks
 * time, not the count, because the time budget is the authoritative one (CLAUDE.md §5); its
 * accessible name says "minutes" for exactly that reason.
 *
 * `data-nav-surface` re-points `--ring` at `--nav-accent` for anything focusable drawn in here: the
 * page's own #C2410C ring is 1.46:1 against this grey.
 */
export function ProgressStrip({
  endsAt,
  plannedMinutes,
  questionsAsked,
  questionBudget,
  now,
}: {
  endsAt: string;
  plannedMinutes: number;
  questionsAsked: number;
  questionBudget: number;
  /** The server's clock, for the first render. Ticking takes over on mount, so the two agree. */
  now: number;
}) {
  const clock = useClock(now);
  const remaining = minutesLeft(endsAt, clock);
  const elapsed = elapsedPercent(endsAt, plannedMinutes, clock);

  return (
    <div data-nav-surface className="sticky top-0 z-10 bg-nav">
      <div className="mx-auto w-full max-w-2xl px-5 pt-2 pb-3 sm:px-8">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-bold text-nav-foreground">
            {questionsAsked === 0
              ? t("interview.screen.progressBefore")
              : t("interview.screen.progress", {
                  asked: questionsAsked,
                  budget: questionBudget,
                })}
          </p>
          <p className="text-base text-nav-muted">{timeLabel(endsAt, clock)}</p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={plannedMinutes}
          aria-valuenow={plannedMinutes - remaining}
          aria-valuetext={t("interview.screen.meter", {
            minutes: remaining,
            total: plannedMinutes,
          })}
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-track"
        >
          <div className="h-full rounded-full bg-progress" style={{ width: `${elapsed}%` }} />
        </div>
      </div>
    </div>
  );
}
