# 0015 — Roles, levels and stacks are content, and a question can be written for a stack

**Status:** Accepted · **Date:** 2026-09-22 · **Amended:** 2026-09-22 (decision 7, un-linking)

> CLAUDE.md §7.4 says an accepted ADR is superseded, not edited. The addition to decision 7 was
> made at the owner's request while this ADR is still unmerged, and it answers a question decision 7
> left open rather than changing any answer it gave — the same reasoning ADR-0014 records for its
> decisions 6 and 7. **Once this is merged, a change becomes a new ADR.**

## Context

Until M2.5 the product's roles and levels were a closed set, `frontend | backend | qa` and
`intern_junior | mid`, written once in `packages/shared-types/src/constants.ts` and then copied into
four more places that each had to agree with it: a Zod enum, two Postgres enums (and two enum *array*
columns), a generated Pydantic `Literal`, and an i18n namespace whose message keys **were** the enum
values. Adding a role meant a change in five languages' worth of artefacts and a database migration,
then a deploy.

That is the wrong shape for a product whose growth story is "more roles". `docs/role-catalogue.md`
lists eighteen of them across four waves; the four launch roles alone already needed a fourth added
after the enum was written.

It was also about to get worse. M3 specifies `InterviewSession (… role, level …)` and question
selection "filtered by role/level", which would have baked in a fifth and sixth copy — and M3 has no
stack dimension at all, so a Java/Spring candidate and a Node candidate would be asked the same
backend questions. Nothing modelled a technology stack beyond `Profile.stack String[]`, an
unvalidated free-text tag list, and the only role→stack relationship in the product was
`STACK_SUGGESTIONS`, a hardcoded map in the browser.

## Decision

### 1. The catalogue is three content entities, with the M2 content workflow

`CareerRole`, `CareerLevel` and `Stack` are rows, each carrying the full publishable-entity column
set from ADR-0014: `status` (`draft → in_review → published → retired`), `version`, a
`content_versions` snapshot on every change, an audit entry, `seed_managed`, and the review state
(`ai_draft_unreviewed`, `reviewed_by_user_id`, `reviewed_at`). They are created and edited in
`/admin/content` by a content expert and published by an admin, exactly like a question.

`CareerRole` rather than `Role`, because Prisma already has an RBAC `Role` enum and two things called
Role in one schema is a bug waiting to be written.

Two join tables say what a role offers: `CareerRoleLevel (role_id, level_id, position)` and
`CareerRoleStack (role_id, stack_id, position, is_default)` — the `TrackTopic` shape the codebase and
the CMS already knew.

**The order is content.** A role's levels and stacks are arrays in display order, because that order
is what a candidate's picker looks like; reordering them earns a version, unlike a track's topics,
which are a set. At most one stack may be the role's default, so the picker starts in one place.

### 2. Slugs on the wire, uuids in the database

Every contract, query string, seed file and e2e selector names a role, level or stack by **slug**;
the database joins on uuids. `?role=backend` keeps working, `content-query.ts` keeps its shape, and
seed files keep referring to each other the way they always have.

An unknown slug is a service-level `ApiError(400, "role_not_found")` (and its two siblings), never a
Zod rejection — validation checks slug *syntax*, the service checks existence.

**Unpublished is not the same as unknown**, and the two paths differ on purpose. The CMS must be able
to tag content with a draft role, so the admin resolvers do not filter by status. A **candidate**
may only choose what is published, so `ProfilesService.resolveTarget` requires `published` on the
role, the level *and* the stack — all three, which the M2.5 review found was true of only two of
them. Publishing a question whose roles, levels or stacks are all still drafts is refused for the
same reason: nobody could be asked it.

### 3. A question carries roles, levels and — only when it is narrowed — stacks

`QuestionCareerRole`, `QuestionCareerLevel` and `QuestionStack` replace two enum array columns. Roles
and levels are many-to-many because a behavioural question belongs to every role; the caps are
`questionRoles: 6`, `questionLevels: 4`, `questionStacks: 8`, chosen as limits rather than inherited
from the size of an enum.

**No stack rows means the question is general to its roles**; stack rows narrow it to candidates on
one of those variants. The test is whether the question would be unfair or meaningless to someone on
another variant — a snippet of JSX is, "how would you decide what to test" is not.

The rule lives in `apps/api/src/content/question-eligibility.ts` as a pure predicate (`isOfferedToStack`)
**and** the Prisma fragment that has to agree with it (`stackFilter`), written next to each other
because the way two expressions of one rule fail is by drifting apart. M3's question selection reuses
both rather than rewriting either.

### 4. A candidate who has chosen no variant is offered the general questions only

The alternative — show them everything — hands a Node developer Spring code because nobody asked.
The onboarding picker starts on the role's default, so arriving with no stack is a deliberate "not
sure yet", and the honest answer to that is the questions that do not depend on knowing.

### 5. Stack applies to questions and to the profile, not to tracks

Tracks stay keyed by `(role, level)`. A stack dimension on tracks multiplies the content matrix by
six before a single stack-specific track exists, and the requirement is stack-specific *questions*.
The door stays open: `tracks.stack_id` is a later migration if the content ever wants it.

### 6. The profile has two stack-shaped fields, and they mean different things

`target_stack` is the catalogue variant the candidate is interviewing for (a slug, nullable, chosen
from the role's list). `technologies` is free text describing what they know. They were both called
"stack" until M2.5, which is how a hardcoded suggestion map came to be the product's only model of a
technology.

A variant a candidate chose is never cleared behind their back: `profiles.target_stack_id` is
`ON DELETE RESTRICT`, and a **retired** role, level or stack stays on the profile that chose it and
is shown by its slug once the published catalogue stops carrying it.

### 7. Retiring is refused while something still uses it — and so is un-linking

`role_in_use`, `level_in_use` and `stack_in_use` refuse to retire a catalogue row that a published
track or question, or a candidate's profile, still points at. Publishing a role is refused unless it
offers at least one **published** level (`career_role_has_no_published_level`), because the candidate
catalogue shows published levels only and a role with nothing to choose is a dead end in onboarding.
Stacks are deliberately not required: a role with no variants is a legitimate role.

This is the M2 handover's failure written down before it happens again ("retiring a rubric silently
hides every published question that uses it") — on the entity that would otherwise blank the whole
catalogue.

**Taking a level or a stack off a role is refused on the same grounds** (`role_level_in_use`,
`role_stack_in_use`), because it is the same failure one step earlier. Un-linking looks like an
ordinary content edit and the database does not object: `profiles.target_level_id` points at the
**level**, not at the link, so dropping the link leaves every affected profile intact and pointing
at a rung the role no longer offers. Nothing errors, nothing is logged, and the candidate discovers
it the next time they open their profile and are made to re-pick a level they never changed.

Two things about the refusal are deliberate:

- **It is scoped to the role.** Retiring a level asks "is anyone, anywhere, using this?";
  un-linking asks only "is anyone using it *for this role*?". A backend candidate at mid level is
  no reason for the frontend role to keep offering mid.
- **It carries the number of profiles affected**, in an `ApiError`'s `details` — the first refusal
  that needed one. "You cannot do this" is not actionable; "4 candidates are preparing at that
  level" tells an admin what migrating them would involve, which is the decision they are actually
  making. `details` carries counts and ids only, never anything a person wrote, and the web app
  still renders its own copy (ADR-0012) with the number dropped into it.

There is no migration path for those candidates yet: the admin's choices are to leave the level on
the role or to move the candidates by hand. Building one is a product decision, recorded in
`tasks/todo.md` rather than guessed at here.

### 8. Labels come from the API; the worker is sent words, not keys

A database-managed role has no message key, so `targetRoles.*` and `levels.*` left `en.json` and
every label is now the `name` on the row the API returns. Client components take their options as
props from their server page, so the browser still never imports a value from shared-types.

For the same reason `CvParseRequest` carries `target_role_label`, `level_label` and `stack_label`
rather than keys: the worker's `ROLE_LABELS` / `LEVEL_LABELS` maps existed only to turn a key into
prompt prose, and with roles as data they could no longer be complete. **A label is staff-written
text that lands in a system prompt, so it is wrapped as data** in `cv_parse.v2.md` like any other
untrusted input, with a test that a label cannot close its own tag.

### 9. Adding a role is content, and that is the acceptance criterion

Proven on 2026-09-22 by adding a fourth launch role, **full-stack**, end to end with no code change
and no migration: four rows in `stacks.yaml`, one block in `roles.yaml`, a second role tag on the
eleven frontend and backend questions that genuinely transfer, `pnpm db:seed`, and an admin pressing
Publish in `/admin/content`. A full-stack candidate is then offered questions from both banks, and a
full-stack candidate on React + Node is additionally offered the two React questions that a Laravel +
Vue candidate is not.

## Consequences

- **Role and level labels are no longer translatable through the i18n catalogue.** English only at
  launch, so this costs nothing today; when a second locale arrives, the translation belongs on the
  content row (a `name_<locale>` column or a translations table), not in `en.json`.
- **Compile-time narrowing is gone.** `openapi-typescript` generated `"frontend" | "backend" | "qa"`
  and four web files leaned on it; those are `string` now, and the runtime 400 is the only guard.
  That is why unknown slugs must produce a mapped, explainable error code rather than a generic
  failure, and why `profile-errors.ts` maps stale catalogue choices to copy that names the field.
- **Publishing the catalogue is a step somebody has to take.** The importer never publishes
  (ADR-0014 decision 5), so a freshly seeded database has a catalogue no candidate can see. The e2e
  suite has a `setup` project that publishes it over the admin API for exactly this reason; a new
  environment needs the same step by hand.
- **The catalogue can outgrow one page of the role editor.** It offers 100 levels and 100 stacks,
  far above the per-role caps of 8 and 20, and says so (`admin.content.role.catalogueCapped`) rather
  than letting a save drop what it never showed.
- **Seven publishable entities, not four.** Anything that enumerates them — `guardedUpdate`,
  `TOMBSTONED_COLUMNS`, the answer-key leak test's exercisers, `CONTENT_TRANSITIONS` — grows with
  each new one, and the schema test fails if `TOMBSTONED_COLUMNS` is not kept complete.
- **A test can mint its own role.** The `(role, level)` pair-ownership scheme in
  `content-fixtures.ts` existed because the enum had six pairs and four were taken; it is deleted.

## Alternatives considered

- **Keep the enums and add a migration per role.** Honest about the cost, and wrong for a product
  whose roadmap is eighteen roles: every one of them would be a deploy, and the content expert who
  writes the bank cannot add the role their bank is for.
- **Lookup tables without the content workflow** — plain reference rows, seeded, no statuses. Half
  the machinery for most of the benefit, but it puts an unreviewed role in front of candidates the
  moment it is inserted, and gives the CMS nowhere to draft one. The workflow already existed;
  reusing it cost one column set.
- **Stack as a free-text tag on the question.** No new entity, no join table. Rejected because the
  candidate's side of the match has to come from a list — matching what a candidate typed against
  what an author typed is a spelling contest, and "Node" ≠ "Node.js" ≠ "NodeJS" would decide which
  questions someone is asked.
- **Stack as a third key on tracks** (role × level × stack). Six times the content matrix for a
  milestone that writes no new tracks, and the requirement was about questions.
- **A `role` column on `Question` instead of a join table**, with full-stack duplicating the
  frontend and backend questions. Duplicated content drifts, and the whole argument for full-stack
  as a launch role is that it costs near-zero content.
