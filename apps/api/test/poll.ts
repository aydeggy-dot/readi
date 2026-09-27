/**
 * How long a spec waits for a background job to land, in milliseconds.
 *
 * ## Why this is a constant, and why it is this big
 *
 * Five specs used to poll for a queued job with their own copy of `for (let i = 0; i < 100; i++)` and
 * their own "after 10 s" message: two for a CV parse, three for an evaluation report. Ten seconds was
 * never measured — a fake worker answers in milliseconds and the whole margin is BullMQ's pickup plus
 * whatever else the machine is doing.
 *
 * **And "whatever else the machine is doing" is the whole of it.** `pnpm test` runs six package suites
 * at once through turbo, the API's own is four vitest workers each building a Nest app with its own
 * Postgres pool (`maxWorkers: 4`), and the development box is six cores and 7 GB. Add a running
 * `pnpm dev` and `dev:worker` and there is very little left. An intermittent failure was seen three
 * times under exactly that combination on 2026-09-27 and did **not** reproduce in twenty runs with the
 * dev servers stopped — ten of the API suite alone and ten of the full `pnpm test --force`. So the
 * cause was never confirmed, and this is a widened margin rather than a fix: see
 * `docs/progress/2026-09-28-flaky-test-hunt.md`.
 *
 * It stays **below** `testTimeout` (30 s) on purpose, so the poll reports what it was waiting for
 * rather than vitest reporting a bare timeout with nothing in it — which is what made the observed
 * failure impossible to name. Raising this means raising that first.
 *
 * Waiting longer costs nothing when the job lands: the loop returns as soon as it does. It only costs
 * time on a failure, and a job that is genuinely broken never completes at any budget — so this cannot
 * turn a real bug into a passing test, only into a slower report of the same bug.
 */
export const BACKGROUND_JOB_BUDGET_MS = 25_000;

/** How often the poll looks. Short enough that the wait is not the measurement. */
const POLL_INTERVAL_MS = 100;

/**
 * Polls until `attempt` returns something, then returns it — or fails saying what it waited for.
 *
 * `what` is the sentence in the failure, so it has to name the thing and its id: "no report for
 * session <uuid>" is actionable and "timed out" is not. `attempt` returns `null` or `undefined` for
 * "not yet" and may throw for "this will never happen", which is the difference between a job that is
 * slow and a route that is answering the wrong thing.
 */
export async function pollFor<T>(
  what: string,
  attempt: () => Promise<T | null | undefined>,
  budgetMs: number = BACKGROUND_JOB_BUDGET_MS,
): Promise<T> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const found = await attempt();
    if (found !== null && found !== undefined) return found;
    // Checked after the attempt, so a budget smaller than one interval still tries once.
    if (Date.now() >= deadline) {
      throw new Error(`${what} after ${Math.round(budgetMs / 1000)} s`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
