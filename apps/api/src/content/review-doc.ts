import type { SeedQuestion, SeedRubric, SeedTopic, SeedTrack } from "@readi/shared-types";
import type { LoadedSeedFile } from "./seed-loader";

/**
 * One printable page per role, built from the seed files, for the experts who review drafted
 * content (CLAUDE.md §7.7). Reading YAML is a skill; reading a question next to its rubric is the
 * job. The document puts each question, its answer key and its five level descriptors together,
 * with a tick-box list of the five things a reviewer is being asked, and the drafter's own
 * uncertainties spelled out.
 *
 * **A role's page is the questions that role is offered, not the questions in its directory**
 * (owner's decision, 2026-09-25). It selected by file path until then, which quietly shrank every
 * page: the four role-general behavioural questions live in `content/seed/frontend/` and carry
 * `roles: [frontend, backend, qa, fullstack]`, so a QA reviewer was asked to sign off 35 questions
 * while QA candidates were offered 45, and the ten they never saw would have reached candidates
 * unreviewed. A directory is where a question is written; `roles` is who is asked it, and only the
 * second is a fact about the candidate. `review-doc.spec.ts` holds the real corpus to it.
 */

export interface ReviewDoc {
  role: string;
  markdown: string;
}

const LEVEL_NAMES = ["absent", "weak", "partial", "solid", "excellent"] as const;

export function buildReviewDoc(
  role: string,
  files: readonly LoadedSeedFile[],
  options: { generatedBy: string },
): ReviewDoc {
  const rubrics = new Map<string, SeedRubric>();
  const topics = new Map<string, SeedTopic>();
  /** Role names come from `roles.yaml` now, not a map in this file (ADR-0015). */
  const roleNames = new Map<string, string>();
  let track: SeedTrack | undefined;
  const authors = new Set<string>();

  for (const { data } of files) {
    for (const rubric of data.rubrics ?? []) rubrics.set(rubric.slug, rubric);
    for (const topic of data.topics ?? []) topics.set(topic.slug, topic);
    for (const role of data.career_roles ?? []) roleNames.set(role.slug, role.name);
    // The track's own `role` field, not the directory it was found in — the same reason the
    // questions below are selected by `roles`.
    if (data.track?.role === role) {
      track = data.track;
      authors.add(data.author);
    }
  }

  /*
   * Written for this role first, then the ones it shares with other banks, each group in the order
   * its file lists them. A reviewer opening their own bank should not have to page past four
   * behavioural questions to reach it, and a shared question says where it lives so they can edit
   * the right file.
   */
  const offered: { file: string; question: SeedQuestion }[] = [];
  for (const { file, data } of files)
    for (const question of data.questions ?? [])
      if (question.roles.includes(role)) {
        offered.push({ file, question });
        authors.add(data.author);
      }
  const own = offered.filter((entry) => inRole(entry.file, role));
  const shared = offered.filter((entry) => !inRole(entry.file, role));
  const entries = [...own, ...shared];
  const questions = entries.map((entry) => entry.question);

  const lessons = (track?.modules ?? []).flatMap((module) => module.lessons);
  const out: string[] = [];

  out.push(`# ${roleNames.get(role) ?? role} — drafted content for expert review`);
  out.push("");
  out.push(
    `**${questions.length} questions**${sharedNote(own.length, shared.length)}` +
      `, ${rubricsUsedBy(questions, rubrics).size} rubrics, ` +
      `${track ? `1 track (${plural(track.modules.length, "module")}, ${plural(lessons.length, "lesson")})` : "no track"}.`,
  );
  out.push("");
  out.push(
    `Everything here is a **draft written by \`${[...authors].sort().join("` and `") || "ai_draft"}\`** ` +
      "and is invisible to candidates until a human publishes it. Your review is what decides " +
      "whether it ever is.",
  );
  out.push("");
  out.push("## What we are asking you");
  out.push("");
  if (own.length === 0) {
    out.push(...askingForABorrowedBank(shared, roleNames));
  } else {
    out.push(
      "For each question, five questions — the tick boxes under each one are there to be ticked:",
    );
    out.push("");
    out.push(
      "1. **Would a real interviewer ask this, at this level?** Not " +
        '"is it a fair question" but "have you heard it, or would you ask it, of someone at this ' +
        'stage?"',
    );
    out.push(
      "2. **Is the rubric what a strong answer actually covers?** The answer key and the criteria are " +
        "what the AI scores against. If something important is missing, that is the most valuable " +
        "correction you can make.",
    );
    out.push(
      "3. **Are the five level descriptors distinguishable?** Two people scoring the same answer " +
        "should land on the same number. If 2 and 3 say the same thing in different words, say so.",
    );
    out.push(
      "4. **Is each planned follow-up what you would actually ask next?** The opening prompt asks " +
        "one thing, like a real interviewer; each remaining criterion carries the probe the AI may " +
        "ask if the answer has not already covered it. A probe that repeats the prompt, or that a " +
        "good first answer would always have pre-empted, is worth saying so.",
    );
    out.push("5. **Is anything factually wrong or out of date?** Tools and versions move.");
    out.push("");
    out.push(
      "Mark up this page, or edit the YAML directly and tell us which. A question written for this " +
        "role is in `content/seed/" +
        role +
        "/`; a question shared with other roles names its own file beside it. Anything you are " +
        "unsure about is worth writing down; so is anything you would cut.",
    );
  }
  out.push("");
  out.push(
    `_Generated from the seed files by \`${options.generatedBy}\`. Do not edit this file: edit the ` +
      "YAML and regenerate._",
  );

  out.push("", "---", "", "## Questions", "");
  entries.forEach(({ file, question }, index) => {
    out.push(
      ...renderQuestion(question, index + 1, rubrics, topics, {
        sharedFrom: inRole(file, role) ? undefined : file,
      }),
    );
  });

  if (track) out.push(...renderTrack(track, topics));

  return { role, markdown: `${out.join("\n").trimEnd()}\n` };
}

function renderQuestion(
  question: SeedQuestion,
  number: number,
  rubrics: Map<string, SeedRubric>,
  topics: Map<string, SeedTopic>,
  options: { sharedFrom?: string } = {},
): string[] {
  const out: string[] = [];
  const topic = topics.get(question.topic);
  out.push(`### ${number}. ${question.slug}`);
  out.push("");
  out.push(
    `**${question.type.replace("_", " ")}** · difficulty ${question.difficulty}/5 · ` +
      // Roles, although the page is a role's page: a question usually belongs to more than one,
      // and REVIEW.md asks the reviewer whether each of these is right — which they cannot answer
      // without seeing the ones it already has (ADR-0015).
      `roles: ${question.roles.join(", ")} · ` +
      `${question.levels.join(", ")} · topic: ${topic?.name ?? question.topic}` +
      (question.subtopic ? ` (${question.subtopic})` : "") +
      // Named only when there are any: "stacks: —" on twelve of fourteen questions would be
      // noise, and the absence is the ordinary case (ADR-0015).
      (question.stacks.length > 0 ? ` · stacks: ${question.stacks.join(", ")}` : "") +
      // Where to edit it. Only for a question this role shares with another bank: a question
      // written for this role is where the header already said it would be.
      (options.sharedFrom ? ` · shared, from \`${options.sharedFrom}\`` : ""),
  );
  out.push("");
  out.push("**The interviewer asks**");
  out.push("");
  out.push(quote(question.prompt));
  if (question.context) {
    out.push("");
    out.push("**Setup the candidate is given**");
    out.push("");
    out.push(quote(question.context));
  }
  out.push("");
  out.push("**What a strong answer covers** — the answer key; never shown to a candidate");
  out.push("");
  for (const point of question.ideal_points) out.push(`- ${point}`);

  const rubric = rubrics.get(question.rubric);
  out.push("");
  if (!rubric) {
    out.push(`**Rubric \`${question.rubric}\` is missing from the seed files.**`);
  } else {
    out.push(`**Rubric: ${rubric.name}** (\`${rubric.slug}\`)`);
    /*
     * The planned follow-up sits with the criterion it probes rather than in a list of its own,
     * because the question a reviewer is being asked is "does this probe draw out *that*
     * criterion" — which cannot be answered without the criterion beside it. Each criterion
     * therefore says either which probe covers it or that the opening prompt is what asks for it.
     */
    /*
     * Grouped, not keyed: a criterion may carry two probes since 2026-09-23, and a Map of
     * criterion → probe silently showed the reviewer only the second of them. They are printed in
     * the order the question lists them, which is the order the engine reaches for them.
     */
    const probes = new Map<number, string[]>();
    for (const plan of question.planned_follow_ups) {
      probes.set(plan.criterion, [...(probes.get(plan.criterion) ?? []), plan.probe]);
    }
    for (const [position, criterion] of rubric.criteria.entries()) {
      out.push("");
      out.push(`**${criterion.dimension} — ${criterion.weight}%**`);
      out.push("");
      out.push(criterion.description);
      out.push("");
      for (const [band, name] of LEVEL_NAMES.entries()) {
        out.push(`- **${band} (${name}):** ${criterion.levels[String(band) as "0"]}`);
      }
      const planned = probes.get(position) ?? [];
      out.push("");
      if (planned.length > 0) {
        out.push(
          planned.length === 1
            ? "_Planned follow-up — asked only if the answer has not already covered this:_"
            : "_Planned follow-ups — asked only if the answer has not already covered this, and the " +
                "second only if the first did not draw it out:_",
        );
        for (const probe of planned) {
          out.push("");
          out.push(quote(probe));
        }
      } else {
        out.push("_Asked for by the opening prompt; no planned follow-up._");
      }
    }
  }

  out.push("");
  out.push(`> **The drafter is unsure about:** ${question.reviewer_notes}`);
  out.push("");
  out.push("- [ ] a real interviewer would ask this, at this level");
  out.push("- [ ] the rubric is what a strong answer actually covers");
  out.push("- [ ] the five level descriptors are distinguishable");
  out.push("- [ ] each planned follow-up is what you would actually ask next");
  out.push("- [ ] nothing here is wrong or out of date");
  out.push("");
  out.push("---");
  out.push("");
  return out;
}

function renderTrack(track: SeedTrack, topics: Map<string, SeedTopic>): string[] {
  const out: string[] = [];
  out.push(`## Track: ${track.title}`);
  out.push("");
  out.push(`\`${track.slug}\` · ${track.role} · ${track.level}`);
  if (track.summary) out.push("", track.summary);
  out.push("");
  out.push(
    "**Topics covered** (core topics drive the readiness score): " +
      track.topics
        .map(
          (link) =>
            `${topics.get(link.topic)?.name ?? link.topic}${link.core ? " **(core)**" : ""}`,
        )
        .join(", "),
  );
  for (const module of track.modules) {
    out.push("", `### ${module.title}`);
    if (module.summary) out.push("", module.summary);
    for (const lesson of module.lessons) {
      out.push("", `#### ${lesson.title}`);
      out.push(
        "",
        `\`${lesson.slug}\`${lesson.estimated_minutes ? ` · ${lesson.estimated_minutes} min` : ""}`,
      );
      out.push("", lesson.body.trim());
    }
    out.push("");
    out.push("- [ ] the lessons above are accurate, current, and worth a junior's time");
  }
  return out;
}

const inRole = (file: string, role: string) => file.split(/[\\/]/).includes(role);

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * The asks for a role with no bank of its own (owner's decision, 2026-09-25). Every question on
 * such a page was written for another role, carries this one as a second role, and is being read
 * question by question on that role's page by a specialist in it. Asking this reviewer to do the
 * same 62 times is asking for the one thing they are worst placed to give and least likely to
 * finish; the thing only they can answer is whether the *set* is an interview for this role, and
 * what is missing between the halves of it. So the page asks that instead, and says plainly that
 * the per-question tick boxes are optional.
 */
function askingForABorrowedBank(
  shared: readonly { file: string; question: SeedQuestion }[],
  roleNames: Map<string, string>,
): string[] {
  /** The banks these came out of, named from `roles.yaml`, in the order the page prints them. */
  const banks: string[] = [];
  for (const { file } of shared) {
    const bank = file.split(/[\\/]/).find((segment) => roleNames.has(segment));
    const name = bank ? (roleNames.get(bank) ?? bank) : undefined;
    if (name && !banks.includes(name)) banks.push(name);
  }
  const from = banks.length > 0 ? list(banks) : "the other banks";

  return [
    `**This role has no bank of its own, so your page is a different job from the others.** All ` +
      `${shared.length} questions below were written for ${from}, and carry this role as a second ` +
      `one. Every one of them is being reviewed question by question, on those pages, by someone ` +
      `who interviews for that role — so we are **not** asking you to do that again.`,
    "",
    "We are asking you one thing: **is this the right set for an interview for this role?** Four " +
      "ways into it:",
    "",
    "1. **What is missing between them?** These questions were each written from one side. The " +
      "ones this role exists for are the ones that only come up when the same person owns both " +
      "ends — a field that changes shape on its way from the database to the screen, a failure " +
      "that has to be handled in two places, a decision about which side does the work. If none " +
      "of those is here, that is the most valuable thing you can tell us.",
    "2. **What would you cut?** A question can be right for the role it was written for and still " +
      "be the wrong use of an hour here. Name them; cutting is the cheapest improvement available.",
    "3. **Is the balance right?** Read the roles line under each question to see which side it " +
      "came from. If an hour of this is mostly one half of the job, say so.",
    "4. **Is the level right?** A question that is mid for a specialist may be senior for someone " +
      "expected to hold both halves, and the other way round.",
    "",
    "The five tick boxes under each question are the specialist review, and you do not need to " +
      "tick them — they are there if a question stops you.",
    "",
    "Mark up this page and send it back however you like. Every question names the file it lives " +
      "in, beside it, if you would rather edit the YAML — but a note saying what is missing is " +
      "worth more here than an edit.",
  ];
}

/** "frontend, backend and QA" — an Oxford-comma-free list, because it is read aloud in the head. */
function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * A role with no bank of its own is not an error — `fullstack` is offered 62 questions out of the
 * other three banks and has written none itself — so the page says so in words rather than opening
 * with "0 written for this role".
 */
function sharedNote(own: number, shared: number): string {
  if (shared === 0) return "";
  if (own === 0) return ", all of them shared with other roles";
  return ` (${own} written for this role, ${shared} shared with other roles)`;
}

const quote = (text: string) =>
  text
    .split("\n")
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");

function rubricsUsedBy(
  questions: readonly SeedQuestion[],
  rubrics: Map<string, SeedRubric>,
): Set<string> {
  const used = new Set<string>();
  for (const question of questions) if (rubrics.has(question.rubric)) used.add(question.rubric);
  return used;
}
