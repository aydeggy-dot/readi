#!/usr/bin/env node
// Checks the rubric stress tests under `evals/datasets/synthetic/` against the rule that makes the
// exercise worth doing (`references/stress-test.md`):
//
//   node .claude/skills/question-bank/scripts/check-stress.mjs [--role frontend]
//
//   - `fluent-but-wrong` must score clearly below `strong` — otherwise the rubric scores fluency.
//   - `correct-poorly-explained` must score clearly above `weak` — otherwise it scores articulacy.
//   - `nigerian-english` must land within one point of `strong` on every criterion — otherwise the
//     descriptor it lost points on is rewarding a particular English rather than engineering.
//
// It also checks the files against the rubrics they name: the dimensions must match the rubric's,
// in the rubric's order, so a reordered or renamed criterion breaks loudly instead of silently
// scoring the wrong thing.

import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const parseYaml = createRequire(join(ROOT, "apps/api/package.json"))("yaml").parse;
const { values } = parseArgs({ options: { role: { type: "string" } } });

/** A clear separation, not a hair's breadth: a fifth of the scale on a 0–4 rubric. */
const MARGIN = 0.8;
const KINDS = [
  "strong",
  "weak",
  "fluent-but-wrong",
  "correct-poorly-explained",
  "nigerian-english",
];

const rubrics = new Map();
for (const file of ["content/seed/rubrics.shared.yaml", ...roleRubricFiles()]) {
  for (const rubric of parseYaml(readFileSync(join(ROOT, file), "utf8")).rubrics ?? [])
    rubrics.set(rubric.slug, rubric);
}

function roleRubricFiles() {
  const seed = join(ROOT, "content/seed");
  return readdirSync(seed)
    .filter(
      (entry) =>
        statSync(join(seed, entry)).isDirectory() && entry !== "review" && entry !== "blueprints",
    )
    .map((role) => `content/seed/${role}/rubrics.yaml`)
    .filter((path) => {
      try {
        statSync(join(ROOT, path));
        return true;
      } catch {
        return false;
      }
    });
}

const problems = [];
const rows = [];

const datasets = join(ROOT, "evals/datasets/synthetic");
for (const role of readdirSync(datasets).filter((entry) =>
  statSync(join(datasets, entry)).isDirectory(),
)) {
  if (values.role && role !== values.role) continue;
  for (const entry of readdirSync(join(datasets, role)).sort()) {
    if (!entry.endsWith(".yaml")) continue;
    const path = join(datasets, role, entry);
    const where = relative(ROOT, path);
    const data = parseYaml(readFileSync(path, "utf8"));
    const rubric = rubrics.get(data.rubric);
    if (!rubric) {
      problems.push(`${where}: names rubric \`${data.rubric}\`, which no seed file defines`);
      continue;
    }
    if (data.generated_by !== "ai_draft")
      problems.push(
        `${where}: \`generated_by\` must stay \`ai_draft\` — these are model-written and model-scored`,
      );

    const dimensions = rubric.criteria.map((criterion) => criterion.dimension);
    const weights = rubric.criteria.map((criterion) => criterion.weight / 100);
    const score = {};
    const byCriterion = {};

    for (const kind of KINDS) {
      const answer = (data.answers ?? []).find((candidate) => candidate.kind === kind);
      if (!answer) {
        problems.push(`${where}: no \`${kind}\` answer`);
        continue;
      }
      const named = (answer.expected ?? []).map((item) => item.dimension);
      if (named.join("|") !== dimensions.join("|"))
        problems.push(
          `${where} — ${kind}: scores [${named.join(", ")}] against a rubric whose criteria are [${dimensions.join(", ")}]`,
        );
      const scores = (answer.expected ?? []).map((item) => item.score);
      if (scores.some((value) => !Number.isInteger(value) || value < 0 || value > 4))
        problems.push(`${where} — ${kind}: a score outside 0–4`);
      if ((answer.expected ?? []).some((item) => !String(item.because ?? "").trim()))
        problems.push(`${where} — ${kind}: a score with no \`because\``);
      byCriterion[kind] = scores;
      score[kind] = scores.reduce((sum, value, index) => sum + value * (weights[index] ?? 0), 0);
    }

    const gapFluent = (score.strong ?? 0) - (score["fluent-but-wrong"] ?? 0);
    const gapWeak = (score["correct-poorly-explained"] ?? 0) - (score.weak ?? 0);
    if (gapFluent < MARGIN)
      problems.push(
        `${where}: \`fluent-but-wrong\` scores ${fmt(score["fluent-but-wrong"])} against \`strong\`'s ${fmt(score.strong)} — the rubric cannot tell confident and wrong from right, which is a defect in the rubric, not in the answer`,
      );
    if (gapWeak < MARGIN)
      problems.push(
        `${where}: \`correct-poorly-explained\` scores ${fmt(score["correct-poorly-explained"])} against \`weak\`'s ${fmt(score.weak)} — the rubric is scoring how it was said`,
      );

    const drift = (byCriterion["nigerian-english"] ?? []).map(
      (value, index) => (byCriterion.strong?.[index] ?? 0) - value,
    );
    drift.forEach((difference, index) => {
      if (difference > 1)
        problems.push(
          `${where} — ${dimensions[index]}: \`nigerian-english\` scores ${difference} below \`strong\`, so that descriptor is rewarding phrasing`,
        );
    });

    rows.push({ role, rubric: data.rubric, score, gapFluent, gapWeak });
  }
}

const fmt = (value) => (value ?? 0).toFixed(2);

console.log(`${rows.length} rubric stress test(s)`);
console.log(
  `  ${"rubric".padEnd(34)} ${"strong".padStart(6)} ${"fluent".padStart(6)} ${"poorly".padStart(6)} ${"weak".padStart(6)}   separations`,
);
for (const row of rows.sort((a, b) => a.gapFluent - b.gapFluent))
  console.log(
    `  ${row.rubric.padEnd(34)} ${fmt(row.score.strong).padStart(6)} ${fmt(row.score["fluent-but-wrong"]).padStart(6)} ${fmt(row.score["correct-poorly-explained"]).padStart(6)} ${fmt(row.score.weak).padStart(6)}   +${fmt(row.gapFluent)} / +${fmt(row.gapWeak)}`,
  );

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.log(`  ${problem}`);
}
console.log(
  problems.length
    ? `\n${problems.length} problem(s)`
    : "\nevery rubric separates fluency from correctness, and articulacy from knowledge",
);
process.exit(problems.length ? 1 : 0);
