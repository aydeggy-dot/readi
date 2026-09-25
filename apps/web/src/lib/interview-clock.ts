import { t } from "@/i18n";

/**
 * The interview's clock, read from the session's wall-clock deadline rather than from a counter.
 *
 * `ends_at` is authoritative and is re-sent on every `state` frame (ADR-0016), so a phone that was
 * backgrounded cannot drift and a resumed session does not silently gain the time it was away.
 * Everything here is pure and takes `now`, so the first render can use the server's clock and the
 * ticking afterwards the browser's, with no hydration mismatch in between.
 */

/** How long is left, in whole minutes, floored — never negative. */
export function minutesLeft(endsAt: string, now: number): number {
  return Math.max(0, Math.floor((Date.parse(endsAt) - now) / 60_000));
}

/**
 * The time, in words. Floored rather than rounded up: telling somebody with 90 seconds left that
 * they have two minutes is the one direction of error that costs them an answer.
 */
export function timeLabel(endsAt: string, now: number): string {
  const remaining = Date.parse(endsAt) - now;
  if (remaining <= 0) return t("interview.screen.timeUp");
  const minutes = minutesLeft(endsAt, now);
  return minutes < 1
    ? t("interview.screen.lastMinute")
    : t("interview.screen.timeLeft", { minutes });
}

/**
 * How much of the session has gone, 0–100, for the meter on the grey bar.
 *
 * The meter tracks **time**, not the question count, because the time budget is the authoritative
 * one (CLAUDE.md §5: the question count is a cap). The count is beside it in words, so the bar is
 * never the only thing saying where the session stands — and the meter's accessible name says
 * plainly that it is minutes, so the two numbers cannot be confused for each other.
 */
export function elapsedPercent(endsAt: string, plannedMinutes: number, now: number): number {
  const total = plannedMinutes * 60_000;
  if (total <= 0) return 100;
  const remaining = Math.max(0, Date.parse(endsAt) - now);
  return Math.min(100, Math.max(0, Math.round(((total - remaining) / total) * 100)));
}

/**
 * How long the session actually took, in whole minutes, at least one.
 *
 * Not `planned_minutes`: a candidate who finished a fifteen-minute interview in six should be told
 * six. The planned length is what was on offer; this is what happened, and the completion screen is
 * a record of what happened.
 */
export function elapsedMinutes(startedAt: string, endedAt: string | null, now: number): number {
  const finished = endedAt ? Date.parse(endedAt) : now;
  return Math.max(1, Math.round((finished - Date.parse(startedAt)) / 60_000));
}
