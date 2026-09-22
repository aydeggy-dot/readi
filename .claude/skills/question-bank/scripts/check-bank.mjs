#!/usr/bin/env node
// Offline checks for the seed question banks. No database, no network, no build step — so it can
// be run while drafting, long before `pnpm db:seed -- --dry-run` has anything to talk to.
//
//   node .claude/skills/question-bank/scripts/check-bank.mjs [--strict] [--dir content/seed]
//
// It deliberately does NOT re-implement the seed contract
// (`packages/shared-types/src/contracts/seed.ts`) — that is the authority, and `pnpm db:seed --
// --dry-run` is how you consult it. What this checks is everything the contract cannot:
//
//   - house style, which is tighter than the contract (3–5 criteria, not 2–8)
//   - descriptors that are present, distinguishable and five in number
//   - a question's `type` against every listed role's `supported_question_types`
//   - a question's levels and stacks against what its roles actually offer
//   - cross-file slug resolution, which the importer only does once it has a database
//   - the bank against its blueprint's `targets` block
//
// The limits it enforces are read out of `packages/shared-types/src/constants.ts` at run time
// rather than copied here, so they cannot drift.

import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

// `yaml` is a dependency of apps/api, not of the workspace root; resolve it from there.
let parseYaml;
try {
  parseYaml = createRequire(join(ROOT, "apps/api/package.json"))("yaml").parse;
} catch {
  console.error("cannot resolve `yaml` — run `pnpm install` first");
  process.exit(2);
}

const { values } = parseArgs({
  options: { strict: { type: "boolean", default: false }, dir: { type: "string" } },
});
const SEED = resolve(ROOT, values.dir ?? "content/seed");

// ------------------------------------------------------------------------------------------- //
// The limits, read from the single source of truth.

const constantsSource = readFileSync(
  resolve(ROOT, "packages/shared-types/src/constants.ts"),
  "utf8",
);

function readLimits(name) {
  const block = constantsSource.match(
    new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\n\\} as const;`),
  );
  if (!block) throw new Error(`cannot find ${name} in packages/shared-types/src/constants.ts`);
  const limits = {};
  for (const line of block[1].split("\n")) {
    const match = line.match(/^\s{2}(\w+):\s*([\d_]+),?\s*$/);
    if (match) limits[match[1]] = Number(match[2].replaceAll("_", ""));
  }
  return limits;
}

const LIMITS = readLimits("CONTENT_LIMITS");
const DIFFICULTY = {
  min: Number(constantsSource.match(/DIFFICULTY_RANGE = \{ min: (\d+), max: (\d+)/)[1]),
  max: Number(constantsSource.match(/DIFFICULTY_RANGE = \{ min: (\d+), max: (\d+)/)[2]),
};
const WEIGHT_TOTAL = Number(constantsSource.match(/RUBRIC_WEIGHT_TOTAL = (\d+)/)[1]);

/** House style, tighter than the contract on purpose (SKILL.md). */
const HOUSE = { criteria: { min: 3, max: 5 }, descriptors: ["0", "1", "2", "3", "4"] };

// ------------------------------------------------------------------------------------------- //

const errors = [];
const warnings = [];
const say = (list, file, subject, message) =>
  list.push(`${relative(ROOT, file)}${subject ? ` — ${subject}` : ""}: ${message}`);
const error = (file, subject, message) => say(errors, file, subject, message);
const warn = (file, subject, message) => say(warnings, file, subject, message);

function yamlFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "review") found.push(...yamlFiles(path));
    } else if (entry.endsWith(".yaml") || entry.endsWith(".yml")) {
      found.push(path);
    }
  }
  return found;
}

const files = yamlFiles(SEED).map((path) => {
  let data;
  try {
    data = parseYaml(readFileSync(path, "utf8"));
  } catch (cause) {
    error(path, null, `not valid YAML — ${cause.message.split("\n")[0]}`);
    data = {};
  }
  return { path, data: data ?? {} };
});

// ------------------------------------------------------------------------------------------- //
// The catalogue, gathered first: everything else is checked against it.

const roles = new Map();
const levels = new Map();
const stacks = new Map();
const topics = new Map();
const rubrics = new Map();
const questions = [];
const tracks = [];

function collect(map, kind, list, file) {
  for (const item of list ?? []) {
    if (!item?.slug) continue;
    if (map.has(item.slug)) {
      error(
        file,
        item.slug,
        `a second ${kind} with this slug (first in ${relative(ROOT, map.get(item.slug).file)})`,
      );
      continue;
    }
    map.set(item.slug, { ...item, file });
  }
}

for (const { path, data } of files) {
  if (data.version !== 1) error(path, null, "every seed file declares `version: 1`");
  if (!["ai_draft", "human"].includes(data.author))
    error(path, null, "`author` must be `ai_draft` or `human`");
  if (data.status !== "draft")
    error(
      path,
      null,
      "`draft` is the only status a file may declare — publishing is an admin's act",
    );

  collect(levels, "level", data.career_levels, path);
  collect(stacks, "stack", data.stacks, path);
  collect(roles, "role", data.career_roles, path);
  collect(topics, "topic", data.topics, path);
  collect(rubrics, "rubric", data.rubrics, path);
  for (const question of data.questions ?? []) questions.push({ ...question, file: path });
  if (data.track) tracks.push({ ...data.track, file: path });
}

const questionSlugs = new Map();
for (const question of questions) {
  if (questionSlugs.has(question.slug))
    error(
      question.file,
      question.slug,
      `a second question with this slug (first in ${relative(ROOT, questionSlugs.get(question.slug))})`,
    );
  else questionSlugs.set(question.slug, question.file);
}

// ------------------------------------------------------------------------------------------- //
// The catalogue's own references.

for (const role of roles.values()) {
  for (const slug of role.levels ?? [])
    if (!levels.has(slug))
      error(role.file, role.slug, `offers level \`${slug}\`, which no file defines`);
  for (const link of role.stacks ?? [])
    if (!stacks.has(link.stack))
      error(role.file, role.slug, `offers stack \`${link.stack}\`, which no file defines`);
  if (!(role.supported_question_types ?? []).length)
    error(
      role.file,
      role.slug,
      "needs at least one `supported_question_types` entry — M3 reads it",
    );
}

// ------------------------------------------------------------------------------------------- //
// Rubrics: house style, and descriptors two readers could agree on.

const normalise = (text) =>
  String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

for (const rubric of rubrics.values()) {
  const criteria = rubric.criteria ?? [];
  if (criteria.length < HOUSE.criteria.min || criteria.length > HOUSE.criteria.max)
    error(
      rubric.file,
      rubric.slug,
      `${criteria.length} criteria; house style is ${HOUSE.criteria.min}–${HOUSE.criteria.max}`,
    );

  const total = criteria.reduce((sum, criterion) => sum + (criterion.weight ?? 0), 0);
  if (total !== WEIGHT_TOTAL)
    error(rubric.file, rubric.slug, `weights total ${total}, not ${WEIGHT_TOTAL}`);

  for (const criterion of criteria) {
    const where = `${rubric.slug} / ${criterion.dimension ?? "(no dimension)"}`;
    if ((criterion.dimension ?? "").length > LIMITS.dimensionMaxLength)
      error(rubric.file, where, `dimension is over ${LIMITS.dimensionMaxLength} characters`);
    if ((criterion.description ?? "").length > LIMITS.criterionDescriptionMaxLength)
      error(
        rubric.file,
        where,
        `description is over ${LIMITS.criterionDescriptionMaxLength} characters`,
      );

    const keys = Object.keys(criterion.levels ?? {})
      .map(String)
      .sort();
    if (keys.join(",") !== HOUSE.descriptors.join(","))
      error(
        rubric.file,
        where,
        `descriptors are ${keys.join(", ") || "(none)"}; all five of 0–4 are required`,
      );

    const seen = new Map();
    for (const [level, text] of Object.entries(criterion.levels ?? {})) {
      if (!String(text ?? "").trim()) error(rubric.file, where, `descriptor "${level}" is empty`);
      if (String(text ?? "").length > LIMITS.levelDescriptorMaxLength)
        error(
          rubric.file,
          where,
          `descriptor "${level}" is over ${LIMITS.levelDescriptorMaxLength} characters`,
        );
      const key = normalise(text);
      if (seen.has(key))
        error(
          rubric.file,
          where,
          `descriptors "${seen.get(key)}" and "${level}" say the same thing — two readers cannot agree on a number that does not exist`,
        );
      else seen.set(key, level);
    }

    // "As 3, but said more confidently" is the canonical defect: it scores delivery, not content.
    if (
      /\b(confiden|articulat|fluen|eloquen|well[- ]spoken)/i.test(
        String(criterion.levels?.["4"] ?? ""),
      )
    )
      warn(
        rubric.file,
        where,
        "descriptor 4 mentions confidence or fluency — score what was said, not how it sounded",
      );
  }
}

// ------------------------------------------------------------------------------------------- //
// Questions.

const usedRubrics = new Set();
// Which banks score against a rubric, by directory rather than by role: `fullstack` rides along on
// the frontend and backend questions by design, so counting roles would call every one of them
// shared.
const rubricBanks = new Map();

for (const question of questions) {
  const at = question.slug ?? "(no slug)";
  const listed = [];
  for (const slug of question.roles ?? []) {
    const role = roles.get(slug);
    if (!role) error(question.file, at, `names role \`${slug}\`, which no file defines`);
    else listed.push(role);
  }
  if (!listed.length && !(question.roles ?? []).length)
    error(question.file, at, "needs at least one role");

  if (!topics.has(question.topic))
    error(question.file, at, `topic \`${question.topic}\` is not in topics.yaml`);
  if (!rubrics.has(question.rubric))
    error(question.file, at, `rubric \`${question.rubric}\` is not defined`);
  else {
    usedRubrics.add(question.rubric);
    if (!rubricBanks.has(question.rubric)) rubricBanks.set(question.rubric, new Set());
    rubricBanks.get(question.rubric).add(relative(SEED, dirname(question.file)) || ".");
  }

  for (const slug of question.levels ?? []) {
    if (!levels.has(slug)) error(question.file, at, `level \`${slug}\` is not in levels.yaml`);
    else if (listed.length && !listed.some((role) => (role.levels ?? []).includes(slug)))
      error(
        question.file,
        at,
        `is offered at \`${slug}\`, which none of its roles offers — no candidate can be asked it`,
      );
  }

  for (const slug of question.stacks ?? []) {
    if (!stacks.has(slug)) error(question.file, at, `stack \`${slug}\` is not in stacks.yaml`);
    else if (
      listed.length &&
      !listed.some((role) => (role.stacks ?? []).some((link) => link.stack === slug))
    )
      error(
        question.file,
        at,
        `is tagged \`${slug}\`, which none of its roles offers — no candidate can be asked it`,
      );
  }

  for (const role of listed) {
    if (!(role.supported_question_types ?? []).includes(question.type))
      error(
        question.file,
        at,
        `is \`${question.type}\`, which ${role.slug} does not support (${(role.supported_question_types ?? []).join(", ")})`,
      );
  }

  // A question tagged for every variant a role offers is a general question with a list attached.
  for (const role of listed) {
    const offered = (role.stacks ?? []).map((link) => link.stack);
    const tagged = question.stacks ?? [];
    if (
      offered.length > 1 &&
      tagged.length >= offered.length &&
      offered.every((slug) => tagged.includes(slug))
    )
      warn(
        question.file,
        at,
        `is tagged for every variant ${role.slug} offers — drop \`stacks:\` and let it be general`,
      );
  }

  if (question.difficulty < DIFFICULTY.min || question.difficulty > DIFFICULTY.max)
    error(
      question.file,
      at,
      `difficulty ${question.difficulty} is outside ${DIFFICULTY.min}–${DIFFICULTY.max}`,
    );

  const tooLong = (value, limit, field) => {
    if (String(value ?? "").length > limit)
      error(question.file, at, `${field} is over ${limit} characters`);
  };
  tooLong(question.prompt, LIMITS.questionPromptMaxLength, "prompt");
  tooLong(question.context, LIMITS.questionContextMaxLength, "context");
  tooLong(question.reviewer_notes, LIMITS.reviewerNotesMaxLength, "reviewer_notes");
  for (const point of question.ideal_points ?? [])
    tooLong(point, LIMITS.idealPointMaxLength, "an ideal point");

  if (!(question.ideal_points ?? []).length)
    error(
      question.file,
      at,
      "has no ideal_points — the answer key is what the evaluator scores against",
    );
  if ((question.ideal_points ?? []).length > LIMITS.idealPoints)
    error(question.file, at, `has more than ${LIMITS.idealPoints} ideal_points`);
  if ((question.roles ?? []).length > LIMITS.questionRoles)
    error(
      question.file,
      at,
      `names more than ${LIMITS.questionRoles} roles — a question serving that many is about none of them`,
    );
  if ((question.levels ?? []).length > LIMITS.questionLevels)
    error(question.file, at, `names more than ${LIMITS.questionLevels} levels`);
  if ((question.stacks ?? []).length > LIMITS.questionStacks)
    error(question.file, at, `names more than ${LIMITS.questionStacks} stacks`);

  const notes = String(question.reviewer_notes ?? "").trim();
  if (!notes)
    error(
      question.file,
      at,
      "`reviewer_notes` is required — it is where the drafter says what it is unsure about",
    );
  else if (!notes.includes("?") && !/^nothing\b/i.test(notes))
    warn(
      question.file,
      at,
      "`reviewer_notes` asks the expert nothing — it should be an uncertainty, not a summary",
    );
}

for (const rubric of rubrics.values()) {
  if (!usedRubrics.has(rubric.slug)) warn(rubric.file, rubric.slug, "no question uses this rubric");
  const banks = rubricBanks.get(rubric.slug);
  if (banks && banks.size > 1 && !rubric.file.endsWith("rubrics.shared.yaml"))
    warn(
      rubric.file,
      rubric.slug,
      `scored against by questions in ${[...banks].sort().join(", ")} — a rubric more than one bank uses belongs in rubrics.shared.yaml`,
    );
}

// ------------------------------------------------------------------------------------------- //
// Tracks, and the role × level combinations that have none.

for (const track of tracks) {
  const role = roles.get(track.role);
  if (!role) error(track.file, track.slug, `names role \`${track.role}\`, which no file defines`);
  if (!levels.has(track.level))
    error(track.file, track.slug, `names level \`${track.level}\`, which no file defines`);
  else if (role && !(role.levels ?? []).includes(track.level))
    error(track.file, track.slug, `is for \`${track.level}\`, which ${role.slug} does not offer`);
  for (const entry of track.topics ?? [])
    if (!topics.has(entry.topic))
      error(track.file, track.slug, `covers topic \`${entry.topic}\`, which is not in topics.yaml`);
  for (const module of track.modules ?? [])
    for (const lesson of module.lessons ?? [])
      if (lesson.topic && !topics.has(lesson.topic))
        error(
          track.file,
          `${track.slug} / ${lesson.slug}`,
          `topic \`${lesson.topic}\` is not in topics.yaml`,
        );
}

const trackFor = new Set(tracks.map((track) => `${track.role}:${track.level}`));
for (const role of roles.values())
  for (const level of role.levels ?? [])
    if (!trackFor.has(`${role.slug}:${level}`))
      warn(
        role.file,
        role.slug,
        `offers \`${level}\` with no track — a candidate there gets \`track_not_found\``,
      );

// ------------------------------------------------------------------------------------------- //
// The banks against their blueprints.

const blueprintDirectory = join(SEED, "blueprints");
const blueprints = [];
try {
  for (const entry of readdirSync(blueprintDirectory).sort()) {
    if (!entry.endsWith(".md") || entry === "README.md") continue;
    const path = join(blueprintDirectory, entry);
    const block = readFileSync(path, "utf8").match(/```ya?ml\n(# targets[\s\S]*?)```/);
    if (!block) continue;
    let targets;
    try {
      targets = parseYaml(block[1]);
    } catch (cause) {
      error(path, "targets", `block is not valid YAML — ${cause.message.split("\n")[0]}`);
      continue;
    }
    blueprints.push({ path, targets });
  }
} catch {
  warn(blueprintDirectory, null, "no blueprints directory — a bank is written from a blueprint");
}

const reconciliation = [];
for (const { path, targets } of blueprints) {
  const role = roles.get(targets.role);
  if (!role) {
    if (targets.role)
      warn(path, "targets", `role \`${targets.role}\` is not in roles.yaml yet — planning only`);
    continue;
  }
  const mine = questions.filter((question) => (question.roles ?? []).includes(role.slug));
  const shortfall = (label, have, want) => {
    reconciliation.push({ role: role.slug, label, have, want });
    if (have < want) {
      const message = `${label}: ${have} of ${want}`;
      if (values.strict || targets.complete) error(path, "targets", message);
      else warnings.push(`${relative(ROOT, path)} — targets: ${message}`);
    }
  };

  for (const [topic, want] of Object.entries(targets.general_by_topic ?? {})) {
    if (!topics.has(topic)) warn(path, "targets", `topic \`${topic}\` is not in topics.yaml yet`);
    const general = mine.filter((q) => q.topic === topic && !(q.stacks ?? []).length);
    // A target is per level — `{ intern-junior: 2, mid: 2 }` — because "two questions on this
    // topic" means nothing to a candidate who can only be asked one of them. A bare number is
    // read as the same target at every level the blueprint writes for.
    const byLevel =
      typeof want === "number"
        ? Object.fromEntries((targets.levels ?? []).map((l) => [l, want]))
        : want;
    for (const [level, count] of Object.entries(byLevel ?? {}))
      shortfall(
        `${topic} @ ${level}`,
        general.filter((q) => (q.levels ?? []).includes(level)).length,
        count,
      );
  }
  for (const [stack, want] of Object.entries(targets.by_stack ?? {})) {
    if (!stacks.has(stack)) warn(path, "targets", `stack \`${stack}\` is not in stacks.yaml yet`);
    const have = mine.filter((q) => (q.stacks ?? []).includes(stack)).length;
    shortfall(`stack / ${stack}`, have, want);
  }
  for (const level of targets.levels ?? [])
    if (!(role.levels ?? []).includes(level))
      warn(path, "targets", `writes for \`${level}\`, which ${role.slug} does not offer`);
}

for (const role of roles.values()) {
  const covered = blueprints.some(({ targets }) => targets.role === role.slug);
  const has = questions.some((question) => (question.roles ?? []).includes(role.slug));
  if (!covered && has)
    warn(
      join(blueprintDirectory, `${role.slug}.md`),
      null,
      `${role.slug} has questions and no blueprint`,
    );
}

// ------------------------------------------------------------------------------------------- //

const counts = new Map();
for (const question of questions)
  for (const slug of question.roles ?? []) {
    const bucket = counts.get(slug) ?? { general: 0, tagged: 0 };
    if ((question.stacks ?? []).length) bucket.tagged += 1;
    else bucket.general += 1;
    counts.set(slug, bucket);
  }

console.log(`${files.length} seed file(s) under ${relative(ROOT, SEED)}`);
console.log(
  `  ${roles.size} roles · ${levels.size} levels · ${stacks.size} stacks · ${topics.size} topics · ${rubrics.size} rubrics · ${questions.length} questions · ${tracks.length} tracks`,
);
for (const [role, bucket] of [...counts].sort())
  console.log(
    `  ${role.padEnd(14)} ${String(bucket.general).padStart(3)} general  ${String(bucket.tagged).padStart(3)} stack-tagged`,
  );

const behind = reconciliation.filter((row) => row.have < row.want);
if (behind.length) {
  console.log(
    `\nagainst the blueprints (${behind.length} of ${reconciliation.length} targets not met):`,
  );
  for (const row of behind)
    console.log(`  ${row.role.padEnd(14)} ${row.label.padEnd(40)} ${row.have} of ${row.want}`);
}

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const warning of warnings) console.log(`  ${warning}`);
}
if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  for (const problem of errors) console.log(`  ${problem}`);
}
console.log(
  errors.length
    ? `\n${errors.length} error(s) — the bank is not ready`
    : warnings.length
      ? `\nno errors, ${warnings.length} warning(s)`
      : "\nall checks pass",
);
process.exit(errors.length || (values.strict && warnings.length) ? 1 : 0);
