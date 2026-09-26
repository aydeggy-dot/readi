import { z } from "zod";

/**
 * Deleting LLM traces (ADR-0008). Langfuse holds prompts, and our prompts hold candidate answers
 * and CV text, so it is a personal-data store with the same obligations as our own database: a
 * deleted account's traces go with it (ADR-0011), and everything else ages out on the retention
 * schedule.
 *
 * The **worker** owns the Langfuse credentials — the API asks it, exactly as it does for every
 * other external AI call (ADR-0004) — and the worker also owns the retention window, because that
 * is a fact about the store it talks to rather than about our database. So the API's hourly sweep
 * says "purge what has expired" and does not carry a number it would have to keep in step.
 */

/**
 * Body of worker `POST /traces/delete`. Exactly one of the two jobs per call:
 *
 * - `user_id` set — every trace belonging to that user, for account erasure. Run **before** the
 *   erasure transaction: afterwards the id is a tombstone and nothing would find them again.
 * - `expired` true — everything past the worker's `LANGFUSE_RETENTION_DAYS`, for the hourly sweep.
 *
 * Neither is a refusal (`bad_request`), rather than a silent no-op that would look like a working
 * sweep for ever.
 */
export const TraceDeleteRequest = z.object({
  user_id: z.uuid().nullable(),
  expired: z.boolean(),
});
export type TraceDeleteRequest = z.infer<typeof TraceDeleteRequest>;

/** Response of worker `POST /traces/delete`. */
export const TraceDeleteResponse = z.object({
  /**
   * False when the worker has no Langfuse keys — local development, CI and e2e. Nothing was
   * deleted because nothing was ever traced, which is a success and not a failure to retry.
   */
  enabled: z.boolean(),
  /** Traces actually deleted. A sweep is bounded, so a large backlog drains over several runs. */
  deleted: z.int().min(0),
});
export type TraceDeleteResponse = z.infer<typeof TraceDeleteResponse>;
