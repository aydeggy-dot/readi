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
//   - descriptors that score the manner rather than the answer ("confidently", "with conviction"),
//     including by the *quantity* of speech ("a detailed plan", "a thorough set of flows")
//   - a criterion asked for by neither the prompt nor a planned follow-up, and a planned
//     follow-up that names a criterion its rubric does not have
//   - a rubric file whose weights are a template rather than a claim
//   - a criterion that keeps its specificity in level 4 instead of level 3
//
// `--numbers` prints every quantitative claim in the bank as a worklist and checks nothing: a
// fact-check asks a vendor whether a claim about their product holds, and cannot tell you that a
// claim about arithmetic is false.
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
  options: {
    strict: { type: "boolean", default: false },
    dir: { type: "string" },
    // Prints every quantitative claim in the bank as a worklist, and checks nothing. A fact-check
    // asks a vendor whether a claim about their product holds; it cannot tell you that a claim
    // about numbers is false. See "Check the arithmetic, not only the vendor" in SKILL.md.
    numbers: { type: "boolean", default: false },
  },
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

/*
 * Thresholds for the level-3 / level-4 balance, chosen by measuring the three banks rather than
 * guessed: `topHeavy` at 1.6 warns on 12 of 305 criteria (3%), and 1.2 would warn on 57 (18%), which
 * is noise. `thin` at 55 warns on 10. Both are proxies for a judgement — see the comment at the check.
 */
const LEVEL_FOUR = { topHeavy: 1.6, thin: 55 };

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
// Counting what a spoken prompt asks for.
//
// An ask is an interrogative ("what", "why", "how much") or a directive to produce something
// ("tell me", "walk me through", "explain"). Two interrogatives sharing one clause — "what and why"
// — are two asks, which is right: they are two things to answer. The engine speaks the prompt once,
// so this is also roughly what a candidate has to hold in their head.

const ASK =
  /\b(what|why|how|where|when|which|who|whether)\b|\b(tell|walk|talk|take)\s+me\b|\b(explain|describe|diagnose)\b/gi;
// A yes/no question is an ask too — "is there anything you would keep out of the link?" — but only
// where it does not already belong to an interrogative, or "what would you change" counts twice.
const YES_NO =
  /(?<!\b(?:what|why|how|where|when|which|who|whether)\s)\b(would|should|could|do|does|did|is|are|can|will)\s+(you|it|that|they|there)\b/gi;

// A house-style **depth cue** asks for nothing new (owner's decision, 2026-09-25): it restores the
// shape of the answer that a triple-barrelled prompt used to carry as a side effect of carrying its
// content. So it must not be counted, or every diagnosis opening would hand its question a free ask
// and a criterion could go unasked behind it — which is the one thing this count exists to catch.
// A closed list, because that is what makes it a cue rather than a second ask: anything else with a
// noun in it ("walk me through how that state comes about") *is* the ask and is counted.
const DEPTH_CUE = /\b(take|walk|talk)\s+me\s+through\s+(it|what\s+you\s+see)\b/gi;

function countAsks(prompt) {
  // "tell me what X" is one ask, not two: drop the interrogative that belongs to a directive.
  const normalise = (t) =>
    t.replace(
      /\b(tell|walk|talk|take)\s+me\s+(through\s+)?(what|why|how|where|when|which|who|whether)\b/gi,
      " $1 me ",
    );
  const count = (t) => (t.match(ASK) ?? []).length + (t.match(YES_NO) ?? []).length;
  const raw = String(prompt ?? "");
  // The cue comes off the raw prompt, before the directive normalisation rewrites "through what".
  // Only as a cue — a prompt that is *nothing but* "Walk me through it." is still one ask.
  const withoutCue = count(normalise(raw.replace(DEPTH_CUE, " ")));
  return withoutCue > 0 ? withoutCue : count(normalise(raw));
}

// ------------------------------------------------------------------------------------------- //
// Words a descriptor may not contain, and words it should be looked at twice for.
//
// Banned outright: these describe delivery and nothing else, so there is no reading on which they
// belong in a descriptor. Suspect: these usually describe the *content* being unspecific, which is
// legitimate and is what separates level 1 from level 2 — but they are the words the defect arrives
// through, so a human confirms each one.

const MANNER_BANNED =
  /\b(confiden\w*|conviction|articulat\w*|fluen\w*|eloquen\w*|polish\w*|rambl\w*|waffl\w*|hesitan\w*|well[- ]spoken|glib|smooth[- ]talk\w*)/i;
const MANNER_SUSPECT =
  /\b(vague\w*|concise\w*|coherent\w*|succinct\w*|detailed|in detail|thorough\w*|accurately|at length)/i;
// The second group — `detailed`, `in detail`, `thorough`, `accurately`, `at length` — was added on
// 2026-09-23, when the QA fairness pass found **nine** level-1 descriptors defining the wrong answer
// by the *quantity* of speech: "a detailed plan that starts with PIN validation", "a thorough set of
// flows", "Names the wrong culprit in detail", "Prices it accurately in minutes". That is the manner
// defect in its third form in three banks, and the first two forms were the ones a lexical check
// already covered. A terse correct answer in a second language matches neither that level 1 nor the
// level 3 above it and drifts down, while a long wrong one is at least recognised. They warn rather
// than error, because each can legitimately describe the *content* being specific.
// `clear` and `verbose` are deliberately NOT on either list. They do too much ordinary work in a
// descriptor — "clearing the cache", "one clear misuse", "JSON is verbose" — for a lexical check to
// be worth the noise, and "every criterion's top band turned on clear" is a defect the fairness
// critique pass caught by reading, in context, which is where it has to be caught.

// ------------------------------------------------------------------------------------------- //
// Rubrics: house style, and descriptors two readers could agree on.

/*
 * Which criteria a probe asks by name — rubric slug to the criterion positions some question probes.
 *
 * A level 0 reading only "Not addressed." described a real situation while a prompt asked three
 * things at once and the candidate answered two of them: the criterion never came up. A
 * `planned_follow_ups` probe removes that situation. The criterion is now asked by name, of the
 * candidate who did not volunteer it, so "not addressed" stops being a wrong answer and becomes the
 * band an evaluator falls back on when the descriptor gives it nothing to land on — which is the
 * house rule "every criterion needs a descriptor that fits a specific, wrong answer" failing at the
 * bottom of the scale. Counted on 2026-09-25 by the fairness sweep: ten of them behind QA probes.
 */
const probedCriteria = new Map();
for (const question of questions)
  for (const plan of question.planned_follow_ups ?? []) {
    if (!probedCriteria.has(question.rubric)) probedCriteria.set(question.rubric, new Set());
    probedCriteria.get(question.rubric).add(plan.criterion);
  }

/*
 * Silence, not a shape. Deliberately a short closed list of whole-descriptor matches rather than a
 * length threshold: 149 level 0s across the banks are under forty characters and almost all of them
 * are the house style working ("Sees nothing wrong", "Everything odd is a defect", "No fix, or a
 * longer wait") — they name what the wrong answer looks like in one breath. These do not.
 */
const SILENT_PHRASE =
  "(not addressed|not specified|not answered|no answer|not considered|does not address(?: it)?)";
/** The whole descriptor is a non-answer: a warning anywhere, an error on a probed criterion. */
const SILENT_LEVEL_ZERO = new RegExp(`^${SILENT_PHRASE}\\.?$`, "i");
/*
 * And the same words with a clause bolted on — "Not addressed — the answer is entirely about the
 * code." The 2026-09-25 sweep fixed eleven whole-string cases and the backend fairness pass then
 * found that two more had escaped for this reason alone, on 35% and 25% criteria: the trailing
 * clause stopped the string matching without making the band any more reachable, because the band
 * still opens by saying the candidate did not answer. Once a probe asks the criterion by name,
 * "not addressed" is never the right opening words for level 0, whatever follows them.
 */
const SILENT_LEVEL_ZERO_OPENING = new RegExp(`^${SILENT_PHRASE}\\b`, "i");

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

  for (const [position, criterion] of criteria.entries()) {
    const where = `${rubric.slug} / ${criterion.dimension ?? "(no dimension)"}`;
    if ((criterion.dimension ?? "").length > LIMITS.dimensionMaxLength)
      error(rubric.file, where, `dimension is over ${LIMITS.dimensionMaxLength} characters`);
    if ((criterion.description ?? "").length > LIMITS.criterionDescriptionMaxLength)
      error(
        rubric.file,
        where,
        `description is over ${LIMITS.criterionDescriptionMaxLength} characters`,
      );

    const levelZero = String(criterion.levels?.["0"] ?? "").trim();
    const probed = probedCriteria.get(rubric.slug)?.has(position) ?? false;
    const bare = SILENT_LEVEL_ZERO.test(levelZero);
    if (bare || (probed && SILENT_LEVEL_ZERO_OPENING.test(levelZero))) {
      const shown = levelZero.length > 90 ? `${levelZero.slice(0, 87)}…` : levelZero;
      const message =
        `level 0 ${bare ? `is "${shown}" and nothing else` : `opens "${shown}"`}, which describes ` +
        "silence rather than a wrong answer — write what a candidate who gets this wrong actually " +
        "says" +
        (probed
          ? ", and note that a planned follow-up asks this criterion by name, so the situation " +
            '"it never came up" no longer arises'
          : " (an error once this bank carries planned follow-ups)");
      if (probed) error(rubric.file, where, message);
      else warn(rubric.file, where, message);
    }

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

    /*
     * Manner words, in ANY descriptor and in the criterion's own wording.
     *
     * "As 3, but said more confidently" is the canonical defect and used to be checked here — on
     * descriptor 4 only, and as a warning. That is exactly how the 2026-09-22 slip got through: the
     * house rule was written as "a descriptor that fits a **confident**, specific, wrong answer",
     * and the word landed in descriptors 0, 1 and 2 of thirty-four criteria across two banks before
     * two critique passes caught it by reading. Every word in a descriptor is a scoring
     * instruction, so one that names the manner tells the evaluator to attend to how an answer
     * sounded — which an evaluator reading a transcript of spoken Nigerian English cannot separate
     * from fluency. Name the belief, never the manner.
     */
    const wording = [
      criterion.dimension,
      criterion.description,
      ...Object.values(criterion.levels ?? {}),
    ]
      .map((value) => String(value ?? ""))
      .join("\n");

    const banned = wording.match(MANNER_BANNED);
    if (banned)
      error(
        rubric.file,
        where,
        `scores the manner, not the answer: "${banned[0]}" — name the belief the wrong answer commits to, not how it was delivered`,
      );

    const suspect = wording.match(MANNER_SUSPECT);
    if (suspect)
      warn(
        rubric.file,
        where,
        `"${suspect[0]}" can read as delivery — keep it only if it describes what was said rather than how`,
      );

    /*
     * Where the criterion puts its specificity — level 3 or level 4.
     *
     * Level 3 is "this person can do the job" and level 4 is the rare answer, so the thing you would
     * actually hire on belongs at 3. A QA critique pass found six criteria at once where it sat at 4
     * instead, which means a candidate scoring 3 across the bank reads as competent while missing the
     * point of every criterion — and the nervous-junior pass found the same thing from the other end
     * ("I would understand the 0s and the 3s, but not one of the 4s").
     *
     * What is NOT checked here, deliberately: whether level 4 is phrased as "As 3, and …". It is in
     * **308 of 309** descriptors across the three banks, because that is the house style — so a check
     * on the shape would flag the style itself and nothing else. What is checkable is the *balance*:
     * a level 4 carrying far more detail than the level 3 under it is a criterion whose specificity
     * has drifted upwards, and a level 4 carrying almost none is decoration. Both are proxies and
     * both are warnings; the semantic question is still a reading.
     */
    const additive = String(criterion.levels?.["4"] ?? "").match(
      /^As 3,?\s*(and|including|plus|with)?\s*/i,
    );
    if (additive) {
      const added = String(criterion.levels["4"]).slice(additive[0].length).trim().length;
      const three = String(criterion.levels?.["3"] ?? "").trim().length;
      if (three > 0 && added > LEVEL_FOUR.topHeavy * three)
        warn(
          rubric.file,
          where,
          `level 4 adds ${added} characters over a level 3 of ${three} — the specificity is in the top band, so an answer scoring 3 may be missing what this criterion is for. Move what you would hire on down to 3`,
        );
      else if (added > 0 && added < LEVEL_FOUR.thin)
        warn(
          rubric.file,
          where,
          `level 4 adds only ${added} characters over level 3 — it should contain something that cannot be bluffed, not a flourish`,
        );
    }
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

  /*
   * The full-stack trap (blueprints/fullstack.md, and the last two rows of STACK_RULE): a question
   * tagged only for another role's variants reaches nobody on this one, because a profile holds one
   * `target_stack` and nothing infers `react-node` from `react-typescript`. The role tag then says
   * something untrue, so this is an error rather than a warning.
   */
  if ((question.stacks ?? []).length) {
    for (const role of listed) {
      const offered = (role.stacks ?? []).map((link) => link.stack);
      if (!offered.length) continue;
      if (!(question.stacks ?? []).some((slug) => offered.includes(slug)))
        error(
          question.file,
          at,
          `carries role \`${role.slug}\` and is tagged [${(question.stacks ?? []).join(", ")}], none of which ${role.slug} offers — no ${role.slug} candidate can ever be asked it. Add one of ${offered.join(", ")}, or drop the role`,
        );
    }
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

  /*
   * A plain YAML scalar containing ": " becomes a mapping, so an ideal point silently turns into an
   * object. The seed contract rejects the file for it; catching it here means the message can say
   * what to do about it, before there is a database to reject anything.
   */
  for (const [index, point] of (question.ideal_points ?? []).entries())
    if (typeof point !== "string")
      error(
        question.file,
        at,
        `ideal_points[${index}] is not text — a colon followed by a space makes YAML read the line as a mapping; quote it`,
      );
  for (const field of ["prompt", "context", "reviewer_notes"]) {
    const value = question[field];
    if (value !== null && value !== undefined && typeof value !== "string")
      error(question.file, at, `${field} is not text — quote it, or use a block scalar`);
  }

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

  /*
   * Every criterion is asked for by the prompt **or** by a planned follow-up.
   *
   * The original rule — every criterion needs a clause in the spoken prompt — was the best finding
   * either critique pass produced: the prompt asks for a diagnosis and the rubric charges 35% for
   * a fix, so a candidate answers the question they were asked, completely, and loses a third of
   * the score. Nine times in the frontend bank, then eighteen in the backend bank by the same
   * drafter, which is why it is a check and not only a sentence in SKILL.md.
   *
   * It collided with the engine (CLAUDE.md §5: the LLM generates follow-ups that probe missing
   * rubric points), because a prompt with a clause per criterion is triple-barrelled and asks the
   * engine's own follow-ups for it. **Resolved 2026-09-23 as different moments**: the opening
   * prompt asks one thing, the remaining criteria become `planned_follow_ups` on the question, and
   * this check adds them to the arithmetic. The rule's purpose — nothing charges for something
   * never asked — is untouched; what moved is where the asking happens.
   *
   * No lexical test can know whether a clause *asks for* a criterion — the first version of this
   * check tried, comparing the words of each dimension against the prompt, and produced 130
   * warnings on 80 questions because dimensions are phrased abstractly ("Fixes it", "Starts
   * narrow") and prompts are not. What is mechanical is the arithmetic: a rubric with three
   * criteria needs three things asked for, in the prompt or in a probe.
   *
   * **An error now, where it used to be a warning.** The warning existed because a drafter could
   * legitimately have one broad clause covering two criteria and say so in `reviewer_notes` —
   * an escape hatch that existed only because there was nowhere else to put the second ask. There
   * is now: a probe. All 104 questions across the three banks satisfied the old warning, so
   * nothing in the repository is grandfathered in by this.
   */
  const scoredBy = rubrics.get(question.rubric);
  const followUps = Array.isArray(question.planned_follow_ups) ? question.planned_follow_ups : [];
  if (scoredBy && typeof question.prompt === "string") {
    const criteria = (scoredBy.criteria ?? []).length;
    const asks = countAsks(question.prompt);
    const probes = new Set(followUps.map((plan) => plan?.criterion)).size;
    if (criteria && asks + probes < criteria)
      error(
        question.file,
        at,
        `${criteria} criteria in \`${question.rubric}\`, and only ${asks + probes} asked for — the prompt asks ${asks} thing${asks === 1 ? "" : "s"} and ${probes} ${probes === 1 ? "criterion has" : "criteria have"} a planned follow-up. Every criterion needs one or the other, or it charges for something the candidate was never asked`,
      );
  }

  /*
   * A planned follow-up names the criterion it probes by position, so the position has to exist —
   * and only the checker can see that, because the contract validates a question without ever
   * looking at its rubric. A probe on a criterion that is not there is a probe the engine will
   * never ask, silently.
   */
  followUps.forEach((plan, index) => {
    const where = `${at}.planned_follow_ups[${index}]`;
    const criterion = plan?.criterion;
    const criteria = (scoredBy?.criteria ?? []).length;
    if (!Number.isInteger(criterion) || criterion < 0)
      error(question.file, where, "`criterion` must be a criterion's position, counting from 0");
    else if (scoredBy && criterion >= criteria)
      error(
        question.file,
        where,
        `probes criterion ${criterion}, but \`${question.rubric}\` has ${criteria} (0–${criteria - 1})`,
      );
    if (typeof plan?.probe !== "string" || plan.probe.trim().length === 0)
      error(question.file, where, "`probe` is what the interviewer says next — it cannot be empty");
    else if (!/[?.]$/.test(plan.probe.trim()))
      warn(
        question.file,
        where,
        "the probe is spoken out loud and should read as a sentence — it ends in neither `?` nor `.`",
      );
  });
  /*
   * At most two probes per criterion (owner's decision, 2026-09-23, after the QA pilot). One was
   * the original rule; the pilot found that a criterion scoring two separable things — "thinks past
   * the happy path **and** says where the list stops" — then has half of itself scored and never
   * asked, which is the defect this whole field exists to remove. A third probe on one criterion
   * means the criterion should have been split instead.
   */
  const perCriterion = new Map();
  for (const plan of followUps) {
    perCriterion.set(plan?.criterion, (perCriterion.get(plan?.criterion) ?? 0) + 1);
  }
  for (const [criterion, count] of perCriterion) {
    if (count > LIMITS.followUpsPerCriterion)
      error(
        question.file,
        at,
        `criterion ${criterion} has ${count} planned follow-ups — the cap is ${LIMITS.followUpsPerCriterion}, and needing a third means the criterion scores too many things to be one criterion`,
      );
  }

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

/*
 * Weights that are a template rather than a claim.
 *
 * `content/seed/REVIEW.md` tells the expert that a rubric's weights "are a claim about what matters
 * most", so a file where nearly every rubric carries the same split is making no claim at all — and
 * the criterion carrying the judgement that transfers ends up being the lightest one by default,
 * because it is the one written last. Found in the QA bank on 2026-09-23 by a critique pass, in one
 * command: 21 of 30 rubrics were exactly 35/35/30 and 8 were 35/30/35, against 11 distinct patterns
 * across frontend's 30 and 12 across backend's 29. Reweighting all 30 on the merits produced 13.
 *
 * The threshold is deliberately loose — this catches a file written on autopilot, not a file with
 * some repetition, and three rubrics sharing a split is normal.
 */
for (const [file, list] of Object.entries(
  [...rubrics.values()].reduce((byFile, rubric) => {
    (byFile[rubric.file] ??= []).push(rubric);
    return byFile;
  }, {}),
)) {
  if (list.length < 8) continue;
  const patterns = new Map();
  for (const rubric of list) {
    const key = (rubric.criteria ?? []).map((criterion) => criterion.weight).join("/");
    patterns.set(key, (patterns.get(key) ?? 0) + 1);
  }
  const [top, count] = [...patterns].sort((a, b) => b[1] - a[1])[0];
  if (count / list.length > 0.5)
    warn(
      file,
      "weights",
      `${count} of ${list.length} rubrics carry the same weights (${top}) — weights are a claim about what matters most in an answer, and a file that repeats one split is not making one`,
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
// --numbers: the arithmetic worklist.

if (values.numbers) {
  // Bare integers 0-9 and the levels' own keys are noise; anything else with a digit is a claim.
  const CLAIM = /(?<![\w.])(?:\d[\d,._]*\s*(?:%|ms|s\b|kb|mb|gb|k\b|x\b)?|\d{2,})(?![\w])/gi;
  const interesting = (text) => {
    const hits = String(text ?? "").match(CLAIM) ?? [];
    return hits.filter((hit) => !/^[0-9]$/.test(hit.trim()));
  };
  let found = 0;
  for (const question of questions) {
    const lines = [];
    const add = (where, text) => {
      const hits = interesting(text);
      if (hits.length)
        lines.push(
          `    ${where}: ${hits.join("  ")}   — ${String(text).replace(/\s+/g, " ").slice(0, 96)}`,
        );
    };
    add("prompt", question.prompt);
    for (const chunk of String(question.context ?? "").split("\n")) add("context", chunk);
    for (const [index, point] of (question.ideal_points ?? []).entries())
      add(`ideal_points[${index}]`, point);
    const rubric = rubrics.get(question.rubric);
    for (const criterion of rubric?.criteria ?? [])
      for (const [level, text] of Object.entries(criterion.levels ?? {}))
        add(`${question.rubric} / ${criterion.dimension} / ${level}`, text);
    if (lines.length) {
      found += lines.length;
      console.log(`\n  ${question.slug}  (${relative(ROOT, question.file)})`);
      console.log(lines.join("\n"));
    }
  }
  console.log(
    `\n${found} quantitative claim(s). Work each one out rather than recognise it — ` +
      `does the stated consequence follow from the stated numbers?\n`,
  );
  process.exit(0);
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
