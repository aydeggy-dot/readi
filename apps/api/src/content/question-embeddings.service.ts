import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type DuplicateCheckRequest,
  type DuplicateMatch,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_LIMITS,
} from "@readi/shared-types";
import { AiCallLogService } from "../ai-calls/ai-call-log.service";
import { AiWorkerClient } from "../ai-worker/ai-worker.client";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { QuestionEmbeddingsRepository } from "./question-embeddings.repository";

/** What a question is embedded from. */
export interface EmbeddableQuestion {
  id: string;
  prompt: string;
  context: string | null;
}

/**
 * Question embeddings (ADR-0006): the API asks the worker for the vector and stores it, and uses
 * it to warn about near-duplicates.
 *
 * Nothing here is allowed to break a publish. A near-duplicate is a warning for a human, and an
 * unreachable worker is a warning for us: both leave the question published, and leave the vector
 * *absent* rather than stale, so `content:reembed` can put it right.
 */
/** Error names only: a provider's or driver's prose could carry question text (CLAUDE.md §5). */
const describe = (error: unknown) => (error instanceof Error ? error.name : "unknown");

@Injectable()
export class QuestionEmbeddingsService {
  private readonly logger = new Logger(QuestionEmbeddingsService.name);

  constructor(
    private readonly worker: AiWorkerClient,
    private readonly aiCalls: AiCallLogService,
    private readonly repository: QuestionEmbeddingsRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The prompt and the setup a candidate reads with it: what makes two questions the same one. */
  static textFor(question: { prompt: string; context: string | null }): string {
    const text = question.context ? `${question.prompt}\n\n${question.context}` : question.prompt;
    return text.slice(0, EMBEDDING_LIMITS.textMaxLength);
  }

  /** Embeds a question, stores the vector, and reports what it looks like a duplicate of. */
  async sync(question: EmbeddableQuestion): Promise<DuplicateMatch[]> {
    const embedded = await this.embed(QuestionEmbeddingsService.textFor(question));
    // No vector to store — an unreachable worker, or one that answered with the wrong shape.
    if (!embedded) {
      await this.clearQuietly(question.id);
      return [];
    }

    try {
      await this.repository.store(question.id, embedded.vector, embedded.model);
    } catch (error) {
      this.logger.error(
        `storing the embedding for question ${question.id} failed: ${describe(error)}`,
      );
      /*
       * The row still holds the vector of the *previous* wording, now wearing the current model's
       * name — which is exactly the one thing `stale()` cannot find, because it looks for a null
       * vector or a different model. Absent beats stale: clearing it puts the question back in
       * `content:reembed`'s sights instead of leaving it wrong for ever.
       */
      await this.clearQuietly(question.id);
      return [];
    }

    try {
      return await this.repository.findSimilar(embedded.vector, {
        threshold: this.env.CONTENT_DUPLICATE_THRESHOLD,
        excludeQuestionId: question.id,
      });
    } catch (error) {
      // A warning that could not be computed. The publish already happened and is what matters;
      // nothing on this path is allowed to turn a publish into a 500 (ADR-0006).
      this.logger.error(
        `searching for duplicates of question ${question.id} failed: ${describe(error)}`,
      );
      return [];
    }
  }

  /**
   * Drops a question's vector, swallowing failure. Every caller is already on a path where the
   * publish has happened and the vector is the lesser concern.
   */
  private async clearQuietly(questionId: string): Promise<void> {
    try {
      await this.repository.clear(questionId);
    } catch (error) {
      this.logger.error(
        `clearing the embedding for question ${questionId} failed: ${describe(error)}`,
      );
    }
  }

  /** Near-duplicates of text that has not been saved yet, for the CMS's question form. */
  async check(request: DuplicateCheckRequest): Promise<DuplicateMatch[]> {
    const embedded = await this.embed(QuestionEmbeddingsService.textFor(request));
    if (!embedded) return [];
    try {
      return await this.repository.findSimilar(embedded.vector, {
        threshold: this.env.CONTENT_DUPLICATE_THRESHOLD,
        excludeQuestionId: request.exclude_question_id,
      });
    } catch (error) {
      // A warning the CMS could not compute is still only a warning: an empty list, never a 500
      // on a form the author is in the middle of writing.
      this.logger.error(`searching for duplicates of unsaved text failed: ${describe(error)}`);
      return [];
    }
  }

  /**
   * One embedding from the worker, with its cost recorded either way (ADR-0007). Returns null —
   * never throws — when there is no usable vector to be had.
   */
  private async embed(text: string): Promise<{ vector: number[]; model: string } | null> {
    const requestId = randomUUID();
    try {
      const response = await this.worker.embed({ request_id: requestId, texts: [text] });
      await this.aiCalls.record(response.ai_calls, {});
      if (response.status !== "ok") {
        this.logger.warn(`embedding ${requestId} failed: ${response.error ?? "unknown"}`);
        return null;
      }
      const vector = response.embeddings[0];
      if (!vector || response.dimensions !== EMBEDDING_DIMENSIONS) {
        // The column is vector(1024): a vector of any other length could not be stored, and a
        // provider or model change is the likely cause (ADR-0006).
        this.logger.error(
          `embedding ${requestId}: ${response.dimensions} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
        );
        return null;
      }
      return { vector, model: response.model };
    } catch (error) {
      // Ids and error names only: request bodies carry content.
      this.logger.warn(
        `embedding ${requestId} unavailable: ${error instanceof Error ? error.name : "unknown"}`,
      );
      return null;
    }
  }
}
