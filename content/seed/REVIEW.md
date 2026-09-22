# Reviewing the drafted content

Everything under `content/seed` was **drafted by a model**. It is marked `status: draft` and
`author: ai_draft`, no candidate can see it, and nothing publishes it automatically. Your review is
what decides whether any of it is worth using.

> **Nothing here reaches a real candidate until you have been through it.**
>
> While we are building, this content gets published in a developer's own database so the interview
> engine has something to run against — that is what it is for, and it costs nothing, because the
> only people looking are us.
>
> **In production it is different, and the code enforces it.** Every item imported from these files
> is marked in the database as an unreviewed AI draft, and the live system **refuses to publish**
> anything still carrying that mark. It clears in one of two ways: someone presses **Mark as
> reviewed** in the CMS, or these files come back with `author: human` and are re-imported. An
> admin can override the refusal deliberately, and doing so is recorded against their name in the
> audit log — it is a door with a lock and a logbook, not a formality (ADR-0014 decision 6).
>
> So: take the time you need. Nothing ships past you by accident.

Please read the generated pages rather than the YAML unless you would rather not:

| Role                                 | Page                                       |
| ------------------------------------ | ------------------------------------------ |
| Frontend (the full set — start here) | [`review/frontend.md`](review/frontend.md) |
| Backend (skeleton)                   | [`review/backend.md`](review/backend.md)   |
| QA (skeleton)                        | [`review/qa.md`](review/qa.md)             |

Each page puts a question, the answer key and all five level descriptors of its rubric in one
place, with tick boxes. They print, and they render on GitHub.

## The four things we are asking

**1. Would a real interviewer ask this, at this level?**
Not "is it a fair question" — "have you asked it, or heard it asked, of someone at this stage?" A
question that only a textbook would ask teaches candidates the wrong thing to prepare for. If it
belongs at a different level, say which.

**2. Is the rubric what a strong answer actually covers?**
This is the most valuable thing you can correct. The answer key (`ideal_points`) and the criteria
are what the AI scores against, so anything missing from them is invisible to the scoring, and
anything wrong in them is scored as if it were right. If a strong candidate would say something we
have not listed, add it.

**3. Are the five level descriptors distinguishable?**
0 is absent, 4 is excellent. Two reviewers reading the same answer should land on the same number.
If 2 and 3 say the same thing in different words, or if the jump from 3 to 4 is "says it more
confidently", that is a defect — tell us, and if you can, say what the real difference is.

**4. Is anything factually wrong or out of date?**
Tools, versions and idioms move. The lessons in each track need the same eye.

## How to send it back

Whichever is least work for you:

- **Mark up the markdown page** — comments, strikethrough, anything. Send it back however you like.
  This is the normal path, and the one we expect for the first round.
- **Edit the YAML directly** (`content/seed/<role>/questions.yaml`) and open a pull request. If you
  do, change `author: ai_draft` to `author: human` in any file you have been through, and clear or
  replace the `reviewer_notes` you have answered.
- **Edit it in the CMS** at `/admin/content`, if you have a Readi login with the content-expert
  role. That is where the rubric editor, the markdown preview and the publishing workflow are, and
  it is the better home for the content once this first review has landed — see below.

Either way, tell us which questions you would **cut**. A bank of six questions you stand behind is
worth more than eight you half-trust, and cutting is the cheapest improvement available.

## Things worth knowing before you start

- **`reviewer_notes` on each question is the drafter saying where it is unsure.** Those are the
  places most likely to need you. Answering them is more valuable than confirming what is fine.
- **A rubric can be shared.** Both behavioural questions use one shared rubric
  (`behavioural-answer-quality`) on purpose, because a behavioural answer is judged the same way
  whatever the role. If you think a question needs its own, say so.
- **Weights add up to 100** and are a claim about what matters most in the answer. They are easy to
  change and often wrong on a first draft.
- **The questions are meant for a Nigerian candidate** preparing for interviews here and abroad:
  mid-range Android phones, unreliable mobile data, and the kinds of teams hiring locally. Content
  that assumes a fast laptop and a stable connection is not neutral — it is wrong for the audience.
- **Nothing here is scored by a human.** An AI interviewer asks the question, and an AI evaluator
  scores the answer against the rubric you are reading. Vague criteria produce vague, unfair
  feedback — precision here is not pedantry, it is the product.

## What happens to your review

For this first round we edit the seed files, regenerate these review pages, and re-import. The
importer only writes what actually changed, so a second pass over one question does not disturb
anything else. Content only reaches candidates when an admin publishes it in the CMS — a deliberate
action, taken after this review, never by an import.

When you send a question back marked good, we do one of two things with it: set `author: human` in
the file and re-import, or press **Mark as reviewed** on it in the CMS. Either one records that a
person has vouched for it and lets it be published in production. Until then the CMS shows it with
an **AI draft, unreviewed** tag, and the live system will not publish it.

After that, the CMS is where the content lives (ADR-0014). The rule is simple and the tooling
enforces it:

> **The files create; the CMS owns.** The moment anyone saves a change to an item in
> `/admin/content`, `pnpm db:seed` stops overwriting that item — it reports it as kept instead. The
> YAML copy becomes a historical draft.

One more rule, for the same reason: **once something is published, the files stop editing it too.**
Candidates are reading those words, so changing them is an admin's deliberate act in the CMS, not a
line in a file — a re-import names published items it would have changed and leaves them alone. So
the window for bulk corrections from the YAML is _before_ the bank goes live, which is exactly the
window this review is for.

So: **corrections to a whole bank at once, before anyone has touched the CMS, go in the YAML;
everything after that goes in the CMS.** Nobody has to remember which is which — the importer says
what it left alone, every time it runs.
