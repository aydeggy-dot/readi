// What candidates really take to answer, so the engine's reserves stop being a guess (M4 phase 7):
//   pnpm --filter @readi/api interviews:pace [-- --minutes 15] [-- --since 2026-09-01]
// Reads only; changes nothing. The sample size is on its face, because a table of numbers is how a
// guess passes for data — see `interviews/pace.ts`.
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnvFile, parseEnv } from "../config/env";
import { PrismaClient } from "../generated/prisma/client";
import { measurePace, renderPace, type PaceSession } from "../interviews/pace";
import { ENGINE_RESERVES } from "../interviews/pace-reserves";
import { cliArgs } from "./args";

async function main(): Promise<number> {
  const { values } = parseArgs({
    args: cliArgs(),
    options: {
      minutes: { type: "string" },
      since: { type: "string" },
      fit: { type: "string", multiple: true },
    },
  });
  const minutes = values.minutes === undefined ? undefined : Number(values.minutes);
  if (minutes !== undefined && !Number.isFinite(minutes)) {
    console.error("usage: interviews:pace -- [--minutes 15|30] [--since YYYY-MM-DD] [--fit 45]");
    return 2;
  }
  const since = values.since === undefined ? undefined : new Date(values.since);
  if (since !== undefined && Number.isNaN(since.getTime())) {
    console.error(`--since is not a date: ${values.since}`);
    return 2;
  }
  const fits = (values.fit ?? []).map(Number);
  if (fits.some((value) => !Number.isFinite(value))) {
    console.error("--fit takes minutes, e.g. --fit 45");
    return 2;
  }

  loadEnvFile();
  const env = parseEnv(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  try {
    const rows = await prisma.interviewSession.findMany({
      where: {
        ...(minutes === undefined ? {} : { plannedMinutes: minutes }),
        ...(since === undefined ? {} : { startedAt: { gte: since } }),
      },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        plannedMinutes: true,
        questionBudget: true,
        maxFollowUps: true,
        status: true,
        startedAt: true,
        endedAt: true,
        modelConfig: true,
        turns: {
          orderBy: { seq: "asc" },
          select: {
            seq: true,
            speaker: true,
            state: true,
            sessionQuestionId: true,
            text: true,
            startedMs: true,
            endedMs: true,
          },
        },
      },
    });
    if (rows.length === 0) {
      console.log(
        "No sessions match. Nothing to measure, which is the honest answer rather than a table of " +
          "zeroes.",
      );
      return 0;
    }
    const sessions: PaceSession[] = rows.map(({ modelConfig, ...row }) => ({
      ...row,
      usedRealModel: usedRealModel(modelConfig),
      turns: row.turns,
    }));
    console.log(
      renderPace(measurePace(sessions, ENGINE_RESERVES, fits.length > 0 ? fits : undefined)),
    );
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Whether a session ever reached a real provider.
 *
 * `interview_sessions.model_config` is written per exchange as `purpose -> "provider/model"`
 * (`interview-sessions.repository.ts`), so a session driven by `LLM_PROVIDER=fake` says `fake/fake`
 * throughout. Read loosely on purpose: the column is Json, an older row may hold anything, and
 * "cannot tell" has to mean "not evidence about pace" rather than "assume it was real".
 */
function usedRealModel(modelConfig: unknown): boolean {
  if (modelConfig === null || typeof modelConfig !== "object" || Array.isArray(modelConfig)) {
    return false;
  }
  return Object.values(modelConfig as Record<string, unknown>).some(
    (value) => typeof value === "string" && !value.startsWith("fake/"),
  );
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
