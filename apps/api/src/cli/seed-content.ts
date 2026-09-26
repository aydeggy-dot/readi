// Imports /content/seed into the database (spec §4.2). Idempotent: a second run changes nothing.
//   pnpm db:seed [-- --dry-run] [--check] [--force] [--force-published] [--dir content/seed]
//
// The files create; the CMS owns (ADR-0014 decision 5). An item edited in the CMS is left alone and
// named in the report, unless --force is passed, which overwrites it and takes it back.
//
// --check is a dry run with an **exit code**: 0 when the database already says what the files say,
// 1 when anything differs, naming what and why. It exists because the report alone was not enough.
// Before the first paid interview run (2026-09-25) a dry run printed "questions: 73 to update" and
// named 31 more under "left alone — published"; it was read, and the run went ahead anyway on
// content three days stale, which is the single reason that run produced no follow-ups. Prose in a
// command that exits 0 is advisory. This is the thing to put in front of anything expensive.
//
// --force-published is the narrow half of --force: it re-imports published rows the files still
// own, and leaves rows a person has edited in the CMS alone. That is the dev refresh; --force is
// the bigger act of taking everything back.
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
import { formatDrift, hasDrift } from "../content/seed-drift";
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
      check: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "force-published": { type: "boolean", default: false },
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

  // --check is a dry run that reports by exit code, so it must never write.
  const check = values.check;
  const dryRun = values["dry-run"] || check;
  const force = values.force;
  const forcePublished = values["force-published"];
  try {
    const report = await new SeedImporter(prisma, content, {
      dryRun,
      force,
      forcePublished,
    }).import(files);
    console.log(`${files.length} file(s) from ${values.dir ?? "content/seed"}`);
    for (const line of formatReport(report, dryRun)) console.log(`  ${line}`);
    for (const line of formatSkipped(report)) console.log(line);
    for (const line of formatPublished(report)) console.log(line);
    if (check) {
      for (const line of formatDrift(report)) console.log(line);
      return hasDrift(report) ? 1 : 0;
    }
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
      // Said separately from "updated": no words changed, only the file's claim about who wrote
      // them, and that is what an expert's YAML review round looks like (ADR-0014 decision 6).
      const reviewed =
        counts.reviewed > 0
          ? `, ${counts.reviewed} ${dryRun ? "to mark reviewed" : "marked reviewed"}`
          : "";
      return (
        `${kind}: ${counts.created} ${verb[0]}, ${counts.updated} ${verb[1]}, ` +
        `${counts.unchanged} ${verb[2]}${reviewed}${skipped}`
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

/**
 * Published items whose file would have rewritten them, by name (ADR-0014 decision 7). Said
 * separately from the CMS-owned list because the reason is different and so is the remedy: these
 * are words candidates are reading right now, and changing them is an admin's deliberate act.
 */
export function formatPublished(report: SeedReport): string[] {
  const live = Object.entries(report).filter(([, counts]) => counts.published.length > 0);
  if (live.length === 0) return [];
  return [
    "",
    "left alone — published, and candidates are reading them:",
    ...live.map(([kind, counts]) => `  ${kind}: ${counts.published.join(", ")}`),
    "",
    "Retire them, edit them in /admin/content as an admin, or re-run with --force (ADR-0014).",
  ];
}

void main().then((code) => process.exit(code));
