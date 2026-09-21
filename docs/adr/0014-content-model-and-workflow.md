# 0014 — Learning content: statuses, version history, the answer key, and the source of truth after import

**Status:** Accepted · **Date:** 2026-09-21

## Context
M2 adds the material a mock interview is made of: tracks, modules, lessons, topics, questions and
rubrics (spec §4.2, §4.8, §6.1). Three groups of people write to it — content experts and admins in
the CMS, and the seed importer reading `/content/seed` — and one group reads it who must never see
half of it: candidates. Four questions had to be settled before any of it was built, and a fifth
came up once the importer and the CMS existed side by side.

## Decision

### 1. Status lives on the publishable units, and dependencies count
`Track`, `Lesson`, `Question` and `Rubric` each carry a status through
`draft → in_review → published → retired` (plus `in_review → draft` and `retired → draft`). A
`Module` is a structural container with no status of its own; it inherits its track's.

A content expert creates, edits and submits; **an admin publishes and retires**. The rules are one
pure function, `apps/api/src/content/content-workflow.ts`, so they are the same wherever a
transition is asked for.

Publishing is refused unless the thing being published can actually be used:

- a rubric's criterion weights total exactly 100 (`rubric_weights_invalid`);
- a question's rubric is already published (`question_rubric_not_published`) — without a rubric M4
  cannot score the answer;
- a track has at least one module (`track_has_no_modules`);
- at most one track is published per (role, level), enforced by a partial unique index rather than
  by a check in code (`track_already_published`), so the candidate API always finds exactly one.

Reading follows the same dependencies: a lesson reaches a candidate only when the lesson **and** its
track are published, a question only when it **and** its rubric are.

### 2. Version history is one table
`content_versions` holds `(entity_type, entity_id, version, snapshot JSONB, changed_by, change_note)`
— one table rather than a shadow table per entity, so there is one shape, one UI and one query. The
snapshot is the entity as it stood *before* the change that produced the next version, including its
children (a rubric carries its criteria) and its status at the time.

A module has no history of its own: editing one snapshots and versions its **track**, because a
module is part of a track's shape.

**A snapshot is written only when the content actually changed.** Every mutation compares the
incoming content with the stored content first (`content-diff.ts`), so saving a form twice, or
running `pnpm db:seed` twice, leaves no trail of identical versions. Each mutation is one
transaction: the row, its snapshot and its audit entry land together or not at all.

### 3. Candidate payloads never carry the answer key
`ideal_points`, rubric criteria, criterion descriptions and the five level descriptors tell a
candidate exactly what a strong answer contains. The candidate-facing schemas are therefore
**separate, smaller shapes** — never an admin shape with fields omitted, because an omission is one
careless `.extend()` away from leaking.

The enforcement is a test, not a convention: `apps/api/test/content-no-answer-key.int.spec.ts` plants
sentinel strings through every answer-key field, reads the endpoint list out of the generated OpenAPI
document, and asserts over the **raw JSON** of every GET under `/api/content/` that no sentinel and
no key matching `/rubric|criteri|ideal_point|level|weight/i` appears at any depth. It runs a second
pass over the corpus in `/content/seed`, so the guarantee holds for the content we actually ship.

### 4. Authorship columns are plain uuids with no foreign key
Content outlives its author. `created_by_user_id` on tracks, lessons, rubrics and questions, and
`content_versions.changed_by_user_id`, are `uuid` columns with no relation, listed in
`TOMBSTONED_COLUMNS` so erasure replaces the id with a tombstone and leaves the content standing
(ADR-0011). `content_flags.user_id` is the opposite case — a candidate's own report about a question
— so it keeps a real foreign key and cascades on deletion.

### 5. The seed files create; the CMS owns
`/content/seed` is where AI-drafted content is written and where expert corrections can be applied in
bulk before anyone has touched the CMS. Once a person edits an item in the CMS, the file must not be
able to undo that work — and `pnpm db:seed` is run from muscle memory.

Every content row therefore carries **`seed_managed`**:

- `true` while the importer is the only thing that has written the row's content;
- `false` from the moment a person saves a change to it in the CMS, and for anything created there.

The importer **creates** what is missing, **updates** only rows that are still `seed_managed`, and
**skips** the rest, reporting each skipped slug by name. `pnpm db:seed -- --force` overwrites them
anyway and takes the rows back (`seed_managed` returns to `true`, and the version snapshot's change
note says `seed import (forced)`, so the history shows what happened). `--dry-run` reports the same
plan without writing.

Two things deliberately do **not** take a row away from the files:

- **A status transition is not an edit.** An admin publishing or retiring seeded content has not
  claimed authorship of its words, so a typo fix in the YAML still reaches it. (It reaches published
  content too: the importer never changes a status, but it does change text, and a published
  question whose wording changes is re-embedded like any other edit — ADR-0006.)
- **Saving a form without changing anything.** The service compares content before it writes
  (decision 2), so an expert who opens a seeded question, reads it and saves takes nothing over.

`seed_managed` is on every admin shape, so the CMS can say plainly which items a re-import will
still overwrite — and therefore where an edit means taking the item over.

**How expert feedback comes back.** `content/seed/review/*.md` is a printable page generated from the
YAML (`pnpm --filter @readi/api content:review-doc`); it is not edited. Reviewers send back notes,
and those notes are applied in one of two places:

- **Before the CMS has the content** — in the YAML, then `pnpm db:seed`. This is the path for the
  first round of review on a whole bank, and for anything that touches many questions at once. The
  files stay the source, `content/seed/review/*.md` is regenerated, and nothing is lost.
- **Once the content is in the CMS** (the preferred path from M2 phase 5 onward) — the expert or an
  admin applies the change in `/admin/content`, which is where the rubric editor, the markdown
  preview, the duplicate warnings and the publish workflow are. The item becomes CMS-owned, the seed
  file stops updating it, and the file's copy is from then on a historical draft rather than the
  truth.

The rule of thumb that follows: **edit the YAML until the first expert review lands, and the CMS
after.** Nothing enforces the order, because nothing needs to — the importer reports what it skipped,
and `--force` is there for the day the files are deliberately made the truth again.

## Consequences
- The CMS is the only place where content is authored after review. `/content/seed` keeps its value
  as the checked-in, reviewable, diff-able draft of the bank, and as the way a fresh database
  (a new developer, CI, the e2e run) gets content.
- A `pnpm db:seed` after expert edits is safe: it prints what it skipped instead of undoing work.
- `seed_managed` must be written by every content write. It is set in `ContentService` alone, from
  `Actor.source` (`SEED_ACTOR` for the importer), so the CLIs and the controllers cannot disagree.
- Anything that adds a content entity must decide three things with it: whether it has a status,
  whether it is versioned on its own or with its parent, and whether it carries `seed_managed`.
- Candidate-facing content is a two-schema world for good. Adding a field to a candidate response
  means adding it to the candidate schema deliberately, and the leak test is the gate.
- A near-duplicate question is a warning and never a refusal (ADR-0006), so the workflow above is
  never blocked by the embedding provider being unreachable.

## Alternatives considered
- **The files stay the source of truth; the CMS is a viewer.** Honest and simple, but it makes the
  CMS useless for the people it is for: an expert would have to send a YAML patch to an engineer to
  fix a level descriptor.
- **The importer refuses to touch anything that is not `draft`.** Uses the workflow as the signal
  instead of a column. It conflates two different things — publishing is not authorship — and it
  would freeze the files out of a bank the day it goes live, including for typo fixes.
- **Derive ownership from the history** (the latest `content_versions` row's `changed_by_user_id`,
  or the audit log). No migration, but it is guesswork: topics and modules have no history of their
  own, a transition writes a version with an admin's id, and "the system wrote it" will stop meaning
  "the seed importer wrote it" the moment a second CLI writes content.
- **`--force` by default, with a `--safe` flag.** Puts the destructive behaviour one forgotten flag
  away, which is exactly the accident this decision exists to prevent.
- **A shadow table per entity** for history: faster typed queries, five times the schema and five
  times the UI.
