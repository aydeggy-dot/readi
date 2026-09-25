import { useSyncExternalStore } from "react";

/**
 * A ticking wall clock, as an external store React subscribes to.
 *
 * The interview screen counts down to a deadline (`ends_at`), so something has to re-render as time
 * passes. A clock is an external system rather than React state, which is what
 * `useSyncExternalStore` is for — and it is also what keeps this out of an effect that calls
 * `setState` in its body (cascading renders; `react-hooks/set-state-in-effect`).
 *
 * One interval for the page, shared by every subscriber, started on the first subscription and
 * stopped with the last: a screen with a header timer and a progress meter should not tick twice.
 *
 * Minute-granularity labels mean a ten-second tick is as often as anything here can usefully change.
 */
const TICK_MS = 10_000;

let current = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    // Read once here rather than in `snapshot`, which React calls during render: a snapshot that
    // changed every time it was read would re-render for ever.
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      for (const subscriber of listeners) subscriber();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const snapshot = () => current;
const unknown = () => 0;

/**
 * The current time in milliseconds, never earlier than `fallback`.
 *
 * `fallback` is the server's clock, passed down by the page, so the first paint of a timer is right
 * rather than blank and hydration has nothing to disagree about. Taking the later of the two also
 * means a browser clock that is behind the server's cannot make a countdown jump backwards.
 */
export function useClock(fallback: number): number {
  const ticked = useSyncExternalStore(subscribe, snapshot, unknown);
  return Math.max(fallback, ticked);
}
