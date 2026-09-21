# Reviewing the drafted content

Everything under `content/seed` was **drafted by a model**. It is marked `status: draft` and
`author: ai_draft`, no candidate can see it, and nothing publishes it automatically. Your review is
what decides whether any of it is worth using.

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
- **Edit the YAML directly** (`content/seed/<role>/questions.yaml`) and open a pull request. If you
  do, change `author: ai_draft` to `author: human` in any file you have been through, and clear or
  replace the `reviewer_notes` you have answered.

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

We edit the seed files, regenerate the review pages, and re-import. The importer only writes what
actually changed, so a second pass over one question does not disturb anything else. Content only
reaches candidates when an admin publishes it in the CMS — a deliberate action, taken after this
review, never by an import.
