import { Injectable } from "@nestjs/common";
import {
  CONTENT_LIMITS,
  type ContentStatus,
  type DuplicateMatch,
  EMBEDDING_DIMENSIONS,
} from "@readi/shared-types";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The only place raw vector SQL lives (ADR-0006). Prisma cannot read or write
 * `Unsupported("vector(1024)")`, so every query that touches `questions.embedding` is written by
 * hand here — and nowhere else, so there is one place to check when the column changes.
 */

interface SimilarRow {
  id: string;
  slug: string;
  prompt: string;
  status: ContentStatus;
  similarity: number;
}

/** pgvector's text form: `[0.1,0.2,…]`. Sent as a parameter and cast, never interpolated. */
export function toVectorLiteral(vector: readonly number[]): string {
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`expected ${EMBEDDING_DIMENSIONS} dimensions, got ${vector.length}`);
  }
  return `[${vector.join(",")}]`;
}

@Injectable()
export class QuestionEmbeddingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Stores the vector and the model that produced it, so stale ones can be found later. */
  async store(questionId: string, vector: readonly number[], model: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE questions
      SET embedding = ${toVectorLiteral(vector)}::vector,
          embedding_model = ${model},
          embedded_at = now()
      WHERE id = ${questionId}::uuid`;
  }

  /** Forgets a question's vector, so it is neither searched nor trusted until it is rebuilt. */
  async clear(questionId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE questions
      SET embedding = NULL, embedding_model = NULL, embedded_at = NULL
      WHERE id = ${questionId}::uuid`;
  }

  /**
   * The nearest questions by cosine distance, closest first. `<=>` is pgvector's cosine distance,
   * so `1 - distance` is the similarity the contract reports; the HNSW index answers the ORDER BY.
   */
  async findSimilar(
    vector: readonly number[],
    options: { threshold: number; excludeQuestionId?: string | null; limit?: number },
  ): Promise<DuplicateMatch[]> {
    const literal = toVectorLiteral(vector);
    const limit = Math.min(options.limit ?? 5, CONTENT_LIMITS.pageSize.max);
    const exclude = options.excludeQuestionId ?? null;
    const rows = await this.prisma.$queryRaw<SimilarRow[]>`
      SELECT id, slug, prompt, status, 1 - (embedding <=> ${literal}::vector) AS similarity
      FROM questions
      WHERE embedding IS NOT NULL
        AND (${exclude}::uuid IS NULL OR id <> ${exclude}::uuid)
        AND 1 - (embedding <=> ${literal}::vector) >= ${options.threshold}
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${limit}`;
    return rows.map((row) => ({
      question_id: row.id,
      slug: row.slug,
      prompt: row.prompt,
      status: row.status,
      // Floating-point arithmetic can put an identical vector a hair above 1.
      similarity: Math.min(1, Math.max(0, row.similarity)),
    }));
  }

  /**
   * Published questions whose vector is missing or was made by another model — what
   * `content:reembed` works through after a provider or model change.
   */
  async stale(model: string, limit: number): Promise<{ id: string }[]> {
    return this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM questions
      WHERE status = 'published'::content_status
        AND (embedding IS NULL OR embedding_model IS DISTINCT FROM ${model})
      ORDER BY updated_at ASC
      LIMIT ${limit}`;
  }

  /** How many published questions currently carry a usable vector, for the CLI's report. */
  async countEmbedded(model: string): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM questions
      WHERE status = 'published'::content_status
        AND embedding IS NOT NULL AND embedding_model = ${model}`;
    return Number(row?.count ?? 0);
  }
}
