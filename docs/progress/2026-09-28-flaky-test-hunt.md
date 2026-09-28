# The intermittent API test failure: not reproduced in twenty runs, and what that rules out

**2026-09-28, branch `feat/m4-evaluation`.** An API test failed three times on 2026-09-27 without ever
being named. The owner asked for it to be caught before moving on: run the suite in a loop, capture a
failing run, identify the test and the cause. **It did not reproduce.** This is the record.

## What was actually observed

Three failures, all on 2026-09-27, all under `pnpm test` (turbo, every package's suite at once):

| when | what the output said |
|---|---|
| right after the fairness change landed | `Test Files 1 failed | 52 passed (53)`, `Tests 1 failed | 587 passed (588)` |
| twice more the same evening | the same shape; no name captured either time |

**Never once was a test name captured**, which is the first finding and the one that cost the most: the
failure was reported by a `grep` over turbo's interleaved output that matched the counts and not the
`×` lines, and turbo's per-package prefixes plus ANSI codes defeated the pattern that would have. Every
re-run was clean, so there was nothing left to read.

## What was run

| loop | condition | result |
|---|---|---|
| 10 × `pnpm --filter @readi/api exec vitest run` | API suite alone | **10 clean** (588 passed each) |
| 10 × `pnpm test --force` | all six package suites through turbo, no cache | **10 clean** |

`--force` matters: without it turbo replays a cached pass and the loop proves nothing.

## The difference between then and now, which is the best lead

The three failures happened while **`pnpm dev` and `dev:worker` were running** — web on 3002, the API on
4000, the worker on 8000. All twenty clean runs happened after WSL restarted, with those stopped.

That is not a small difference on this machine:

- **6 cores, 7 GB of RAM**, and ~2 GB free *with* the dev servers already down.
- `pnpm test` runs six package suites concurrently through turbo.
- The API's own suite is `maxWorkers: 4`, and **each worker builds its own Nest app with its own
  Postgres pool** — the config comments say the bound exists because an unbounded run exhausts
  Postgres' 100 connections.
- Add a Next dev server, a Nest watcher and a uvicorn reloader on top of that.

So the most likely reading is **resource contention under a load that no longer exists**, and the
honest position is that the cause is unconfirmed rather than explained.

## The thinnest margin in the suite, which is the named suspect

Five specs waited on a real background job with a hand-rolled poll, each its own copy of
`for (let i = 0; i < 100; i++)` at 100 ms — a **10-second** budget:

| spec | waiting for |
|---|---|
| `evaluations.int.spec.ts` | a `session_reports` row, via the real BullMQ queue |
| `interview-pinning.int.spec.ts` | the same |
| `content-no-answer-key.int.spec.ts` | `GET /report` to stop answering 409 |
| `cv.int.spec.ts` | a CV parse to leave `processing` |
| `account.int.spec.ts` | a CV parse to reach `parsed` |

Ten seconds was never measured. The fake worker answers in milliseconds, so the whole margin is BullMQ
pickup plus whatever else the machine is doing — and "whatever else the machine is doing" is the entire
variable. These are the only assertions in the suite whose passing depends on wall-clock progress under
load, which makes them the suspects; and each one fails with a sentence that names itself, which is
consistent with a failure nobody could name only because the name was never captured.

## What changed, and what it is not

**A widened margin and one place to change it**, not a fix for a proven cause:

- `apps/api/test/poll.ts` — `pollFor(what, attempt, budget?)` and `BACKGROUND_JOB_BUDGET_MS = 25_000`,
  replacing all five copies. Its own module rather than `helpers.ts` so that testing it costs an import
  of a dozen lines instead of the whole Nest module graph.
- 10 s → **25 s**, still under `testTimeout` (30 s) **on purpose**: the poll must report what it was
  waiting for before vitest reports a bare timeout, which is precisely the property that made the
  observed failure unnameable. Raising the budget again means raising `testTimeout` first, and a test
  asserts the ordering.
- `apps/api/test/poll.test.ts` — seven cases, because this helper's failure mode is **silence**: a poll
  that returned too eagerly would let every spec waiting on a queued job pass without the job having
  run, and nothing else in the suite would notice. One of the seven is `0`/`false`/`""` being answers
  rather than "not yet", which is the bug a helper written with `if (found)` would have had.

**Waiting longer cannot mask a real bug.** The loop returns the moment the job lands, so a longer budget
costs nothing when things work; and a job that is genuinely broken never completes at any budget, so
this turns a real failure into a slower report of the same failure, never into a pass.

## If it happens again

1. **Capture the name.** `pnpm --filter @readi/api exec vitest run --reporter=verbose` writes `×` lines
   per test; through turbo, strip ANSI (`sed 's/\x1b\[[0-9;]*m//g'`) before grepping, and grep the `×`
   lines rather than the counts. The loop script used here is in the session scratchpad; the useful part
   is that it saved every run's full log rather than a summary.
2. **Note whether `pnpm dev` was running**, because that is the one variable this hunt could identify
   and could not test — it would mean deliberately running the suite against a loaded machine.
3. **If it is one of the five polls**, the message names itself and the budget is now one constant.
4. **If it is not**, that rules out the only mechanism found here, and the next suspects are the rate
   limiters (six interviews an hour, shared database) and the repeat sweeps, which already log errors
   during a normal run and so are easy to mistake for a cause.

## State

- `pnpm lint`, `pnpm typecheck`, `pnpm format:check` clean; API suite **595 passed** (588 + the seven
  new poll cases).
- `pnpm test:e2e` green for the first time this milestone, now that the dev servers are down: **9
  passed, 6 skipped** (the opt-in visual and slow-network specs). It covers the interview but **not the
  report** — "e2e interview → report" is still owed by M4 phase 7.


---

## Caught, 2026-09-28 (during M4 phase 5)

**It is `test/content-no-answer-key.int.spec.ts`, and it is a Postgres connection timeout, not an
assertion.** Twenty runs did not reproduce it; the twenty-third did, with the whole log saved this time
rather than tailed.

```
FAIL  test/content-no-answer-key.int.spec.ts > candidate content never carries the answer key
Error: Connection terminated due to connection timeout
  ❯ pg-pool/index.js:45:11
  ❯ PrismaPgAdapter.performIO … queryRaw
Caused by: Error: Connection terminated unexpectedly
```

The suite is a **Failed Suite**, not a failed test — `beforeAll` never finished, which is why the
counts read `568 passed | 31 skipped` rather than `1 failed`. That shape is the tell, and it is what to
grep for next time.

### The second error was ours, and it hid the first

`afterAll` then threw a `PrismaClientValidationError` on
`interviewSession.deleteMany({ where: { userId: { in: [undefined, undefined, undefined] } } })` —
"Can not use `undefined` value within array" — because a `beforeAll` that died before the three
`giveProfile` calls leaves all three ids unset. Two errors in the log, and the loud, specific,
wrong-looking one was a consequence of the quiet one.

**Fixed**: the hook filters the ids it has, skips the content removal it never created, and closes an
app that may not exist. A teardown is the first thing somebody reads after a setup failure, so it has
to survive one.

### What it says about the cause

It confirms the one lead this document already had — contention, not logic. This run was
`pnpm test --force` with six package suites in parallel on six cores and ~7 GB, with the API's own four
Nest apps inside one of them; the connection pool could not get a socket inside its timeout. Nothing in
the spec is at fault, and nothing about it is specific to answer keys: it is simply one of the heavier
integration suites (31 tests, three accounts, a whole scored interview) and so the most likely to be
waiting on the pool when it is exhausted.

**Not fixed, and deliberately**: the contention itself. A pool timeout under a deliberately parallel
full-suite run on a 7 GB box is the machine, not the code, and the remedies (a bigger pool, fewer turbo
lanes, `--maxWorkers`) all trade something real for a failure that appears roughly once in twenty runs
and never in CI. What has changed is that it will now name itself the first time rather than the
twenty-third.

### The rule this adds to `tasks/lessons.md`

A `beforeAll` that can fail needs an `afterAll` that can survive it. Otherwise the first genuine
failure arrives wearing a second, more confident error as a mask.
