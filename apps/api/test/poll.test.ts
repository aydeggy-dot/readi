import { describe, expect, it } from "vitest";
import { BACKGROUND_JOB_BUDGET_MS, pollFor } from "./poll";

/**
 * The poll five integration specs wait on, tested on its own.
 *
 * It is worth its own file because it is the one helper whose failure mode is **silence**: a poll that
 * returned too eagerly would let every spec that waits for a queued job pass without the job having
 * run, and nothing else in the suite would notice. It lives in `poll.ts` rather than `helpers.ts` so
 * that testing it costs an import of a dozen lines instead of the whole Nest module graph.
 *
 * The attempts below return resolved promises rather than being `async`, because an `async` arrow with
 * nothing to await is a lint error — and because the helper's contract is "returns a promise", not
 * "is an async function".
 */
describe("pollFor", () => {
  it("returns the first thing the attempt yields, and stops asking", async () => {
    let calls = 0;
    const found = await pollFor("nothing", () => {
      calls += 1;
      return Promise.resolve(calls < 3 ? null : `found on ${calls}`);
    });
    expect(found).toBe("found on 3");
    expect(calls).toBe(3);
  });

  it("treats undefined as 'not yet', like null", async () => {
    let calls = 0;
    await pollFor("nothing", () => Promise.resolve(++calls < 2 ? undefined : "at last"));
    expect(calls).toBe(2);
  });

  it("returns a falsy value that is neither null nor undefined", async () => {
    // `0`, `false` and `""` are answers. A helper written with `if (found)` would poll past them until
    // it timed out, which is the bug this case exists to prevent.
    expect(await pollFor("nothing", () => Promise.resolve(0))).toBe(0);
    expect(await pollFor("nothing", () => Promise.resolve(false))).toBe(false);
    expect(await pollFor("nothing", () => Promise.resolve(""))).toBe("");
  });

  it("says what it was waiting for, and for how long", async () => {
    // The whole point of the `what` argument: "no report for session <id> after 25 s" is actionable
    // and "timed out" is not — and an unnameable failure is exactly what sent a flake hunt nowhere.
    await expect(
      pollFor("no report for session abc", () => Promise.resolve(null), 0),
    ).rejects.toThrow("no report for session abc after 0 s");
  });

  it("tries once even on a budget smaller than one interval", async () => {
    let calls = 0;
    await expect(
      pollFor(
        "nothing",
        () => {
          calls += 1;
          return Promise.resolve(null);
        },
        0,
      ),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("lets an attempt throw straight through, because that will never come good", async () => {
    // A route answering the wrong status is not a slow job, and waiting for it to stop proves nothing.
    await expect(
      pollFor("nothing", () => Promise.reject(new Error("report failed: 500"))),
    ).rejects.toThrow("report failed: 500");
  });

  it("keeps its budget under the suite's testTimeout", () => {
    // If this ever inverts, the poll stops reporting what it waited for and vitest reports a bare
    // timeout instead — which is the thing that made the observed failure impossible to name.
    expect(BACKGROUND_JOB_BUDGET_MS).toBeLessThan(30_000);
  });
});
