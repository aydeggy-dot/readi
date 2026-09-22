// Re-embeds published questions whose vector is missing or was made by another model — the path
// to run after switching EMBEDDING_PROVIDER or EMBEDDING_MODEL in the worker (ADR-0006):
//   pnpm --filter @readi/api content:reembed -- [--dry-run] [--limit 500] [--model voyage-4]
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { AiCallLogService } from "../ai-calls/ai-call-log.service";
import { HttpAiWorkerClient } from "../ai-worker/ai-worker.client";
import { loadEnvFile, parseEnv } from "../config/env";
import { QuestionEmbeddingsRepository } from "../content/question-embeddings.repository";
import { QuestionEmbeddingsService } from "../content/question-embeddings.service";
import { PrismaService } from "../prisma/prisma.service";
import { cliArgs } from "./args";

const BATCH = 25;

async function main(): Promise<number> {
  const { values } = parseArgs({
    args: cliArgs(),
    options: {
      "dry-run": { type: "boolean", default: false },
      limit: { type: "string", default: "1000" },
      model: { type: "string" },
    },
  });
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1) {
    console.error("usage: content:reembed -- [--dry-run] [--limit <n>] [--model <name>]");
    return 2;
  }

  loadEnvFile();
  const env = parseEnv(process.env);
  const prisma = new PrismaService(env);
  const worker = new HttpAiWorkerClient(env);
  const repository = new QuestionEmbeddingsRepository(prisma);
  const embeddings = new QuestionEmbeddingsService(
    worker,
    new AiCallLogService(prisma),
    repository,
    env,
  );

  try {
    // Which model counts as current: the worker's configuration, not ours. Asking it to embed one
    // short string is the only way to find out, and it proves the worker is reachable before we
    // start a run that would otherwise clear every vector it touched.
    const model = values.model ?? (await probeModel(worker));
    if (!model) {
      console.error("the worker could not embed: check EMBEDDING_PROVIDER and its key, then retry");
      return 1;
    }

    const embedded = await repository.countEmbedded(model);
    const stale = await repository.stale(model, limit);
    console.log(`model ${model}: ${embedded} up to date, ${stale.length} to (re-)embed`);
    if (values["dry-run"] || stale.length === 0) return 0;

    let done = 0;
    let failed = 0;
    for (let index = 0; index < stale.length; index += BATCH) {
      for (const { id } of stale.slice(index, index + BATCH)) {
        const question = await prisma.question.findUnique({
          where: { id },
          select: { id: true, prompt: true, context: true },
        });
        if (!question) continue;
        await embeddings.sync(question);
        const after = await prisma.question.findUnique({
          where: { id },
          select: { embeddingModel: true },
        });
        if (after?.embeddingModel === model) done += 1;
        else failed += 1;
      }
      console.log(`  ${done + failed}/${stale.length}…`);
    }
    console.log(`embedded ${done}; ${failed} failed (their vectors were cleared, not left stale)`);
    return failed === 0 ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

/** The model the worker is configured with, or null when it cannot embed at all. */
async function probeModel(worker: HttpAiWorkerClient): Promise<string | null> {
  try {
    const response = await worker.embed({
      request_id: randomUUID(),
      texts: ["readi embedding probe"],
    });
    return response.status === "ok" ? response.model : null;
  } catch {
    return null;
  }
}

void main().then((code) => process.exit(code));
