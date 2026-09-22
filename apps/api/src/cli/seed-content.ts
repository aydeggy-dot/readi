// Imports /content/seed into the database (spec §4.2). Idempotent: a second run changes nothing.
//   pnpm db:seed [-- --dry-run] [--force] [--dir content/seed]
//
// The files create; the CMS owns (ADR-0014 decision 5). An item edited in the CMS is left alone and
// named in the report, unless --force is passed, which overwrites it and takes it back.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { AiCallLogService } from "../ai-calls/ai-call-log.service";
import { HttpAiWorkerClient } from "../ai-worker/ai-worker.client";
import { AuditService } from "../audit/audit.service";
import { loadEnvFile, parseEnv } from "../config/env";
import { ContentService } from "../content/content.service";
import { QuestionEmbeddingsRepository } from "../content/question-embeddings.repository";
import { QuestionEmbeddingsService } from "../content/question-embeddings.service";
import { SeedImporter, SeedReferenceError, type SeedReport } from "../content/seed-import";
import { formatProblem, loadSeedDirectory } from "../content/seed-loader";
import { PrismaService } from "../prisma/prisma.service";
import { cliArgs } from "./args";

const REPOSITORY_ROOT = resolve(__dirname, "../../../../..");

async function main(): Promise<number> {
  const { values } = parseArgs({
    args: cliArgs(),
    options: {
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      dir: { type: "string" },
    },
  });
  const directory = resolve(REPOSITORY_ROOT, values.dir ?? "content/seed");
  if (!existsSync(directory)) {
    console.error(`no seed directory at ${directory}`);
    return 2;
  }

  const { files, problems } = loadSeedDirectory(directory, REPOSITORY_ROOT);
  if (problems.length > 0) {
    // Every problem, not just the first: a reviewer fixing a file wants the whole list.
    for (const problem of problems) console.error(formatProblem(problem));
    console.error(`\n${problems.length} problem(s) in ${directory}; nothing was imported`);
    return 1;
  }
  if (files.length === 0) {
    console.log(`no seed files in ${directory}`);
    return 0;
  }

  loadEnvFile();
  const env = parseEnv(process.env);
  const prisma = new PrismaService(env);
  const content = new ContentService(
    prisma,
    new AuditService(prisma),
    new QuestionEmbeddingsService(
      new HttpAiWorkerClient(env),
      new AiCallLogService(prisma),
      new QuestionEmbeddingsRepository(prisma),
      env,
    ),
    env,
  );

  const dryRun = values["dry-run"];
  const force = values.force;
  try {
    const report = await new SeedImporter(prisma, content, { dryRun, force }).import(files);
    console.log(`${files.length} file(s) from ${values.dir ?? "content/seed"}`);
    for (const line of formatReport(report, dryRun)) console.log(`  ${line}`);
    for (const line of formatSkipped(report)) console.log(line);
    if (dryRun) console.log("\ndry run: nothing was written");
    return 0;
  } catch (error) {
    if (error instanceof SeedReferenceError) {
      console.error(`${error.file}: ${error.message}`);
      return 1;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

export function formatReport(report: SeedReport, dryRun: boolean): string[] {
  const verb = dryRun
    ? ["to create", "to update", "unchanged"]
    : ["created", "updated", "unchanged"];
  return Object.entries(report)
    .filter(
      ([, counts]) =>
        counts.created + counts.updated + counts.unchanged + counts.skipped.length > 0,
    )
    .map(([kind, counts]) => {
      const skipped = counts.skipped.length > 0 ? `, ${counts.skipped.length} kept` : "";
      return (
        `${kind}: ${counts.created} ${verb[0]}, ${counts.updated} ${verb[1]}, ` +
        `${counts.unchanged} ${verb[2]}${skipped}`
      );
    });
}

/**
 * The items the CMS owns now, by name. A count on its own would send the reader hunting, and this
 * is the line that explains why a file's change did not land (ADR-0014 decision 5). A forced run
 * never reaches it: nothing is kept back from one.
 */
export function formatSkipped(report: SeedReport): string[] {
  const kept = Object.entries(report).filter(([, counts]) => counts.skipped.length > 0);
  if (kept.length === 0) return [];
  return [
    "",
    "kept as they are — edited in the CMS since they were imported:",
    ...kept.map(([kind, counts]) => `  ${kind}: ${counts.skipped.join(", ")}`),
    "",
    "Edit them in /admin/content, or re-run with --force to overwrite (ADR-0014).",
  ];
}

void main().then((code) => process.exit(code));
