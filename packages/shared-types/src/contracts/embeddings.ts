import { z } from "zod";
import { EMBEDDING_LIMITS } from "../constants.js";
import { AiCallRecord } from "./cv.js";

/**
 * Embeddings (ADR-0004, ADR-0006). The API asks the worker; the worker calls the provider and
 * reports what the call cost. Only content text travels here — a question's prompt and context —
 * never a candidate's words.
 */

/** Body of worker `POST /embeddings`. */
export const EmbedRequest = z.object({
  request_id: z.uuid(),
  texts: z
    .array(z.string().min(1).max(EMBEDDING_LIMITS.textMaxLength))
    .min(1)
    .max(EMBEDDING_LIMITS.batchMax),
});
export type EmbedRequest = z.infer<typeof EmbedRequest>;

/**
 * Response of worker `POST /embeddings`. A provider failure is an answer, not an HTTP error: the
 * call still costs latency and the API still records it in `ai_call_log` (ADR-0007), exactly as
 * `CvParseResponse` does.
 */
export const EmbedResponse = z.object({
  request_id: z.uuid(),
  status: z.enum(["ok", "failed"]),
  /** Why it failed — a provider error code, never provider prose. Null when `status` is "ok". */
  error: z.string().min(1).max(60).nullable(),
  model: z.string().min(1).max(60),
  /** The length of each vector. The API refuses to store one of any other length. */
  dimensions: z.int().min(0),
  /** One unit-length vector per input text, in the order the texts were sent; empty on failure. */
  embeddings: z.array(z.array(z.number())),
  ai_calls: z.array(AiCallRecord),
});
export type EmbedResponse = z.infer<typeof EmbedResponse>;
