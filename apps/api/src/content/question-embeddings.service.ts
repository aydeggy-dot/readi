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
    try {
      if (!embedded) {
        await this.repository.clear(question.id);
        return [];
      }
      await this.repository.store(question.id, embedded.vector, embedded.model);
      return await this.repository.findSimilar(embedded.vector, {
        threshold: this.env.CONTENT_DUPLICATE_THRESHOLD,
        excludeQuestionId: question.id,
      });
    } catch (error) {
      // The publish already happened and is what matters; the vector can be rebuilt by
      // `content:reembed`. Nothing on this path is allowed to turn a publish into a 500.
      this.logger.error(
        `storing the embedding for question ${question.id} failed: ${
          error instanceof Error ? error.name : "unknown"
        }`,
      );
      return [];
    }
  }

  /** Near-duplicates of text that has not been saved yet, for the CMS's question form. */
  async check(request: DuplicateCheckRequest): Promise<DuplicateMatch[]> {
    const embedded = await this.embed(QuestionEmbeddingsService.textFor(request));
    if (!embedded) return [];
    return this.repository.findSimilar(embedded.vector, {
      threshold: this.env.CONTENT_DUPLICATE_THRESHOLD,
      excludeQuestionId: request.exclude_question_id,
    });
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
