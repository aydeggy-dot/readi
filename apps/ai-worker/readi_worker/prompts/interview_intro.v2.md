{#-
  The greeting. This template is RENDERED AND SPOKEN — it is the one thing the interviewer says
  that no model writes.

  Everything in it is a fact about the session: how long it runs, how many questions there are,
  that follow-ups happen, that skipping and ending early are allowed. A model paraphrasing those
  gets them wrong eventually, and a candidate who was told "about four questions" and got eight has
  been misled by us. It is also the moment the candidate is staring at an empty screen waiting for
  the session to begin, so the call it saves is the one worth saving most.

  It is versioned like a prompt and recorded in `interview_sessions.prompt_versions` like a prompt,
  because a session should be able to say what it said.

  --------------------------------------------------------------------------------------------
  v2, 2026-09-26. **v1 said something untrue.** It reassured the candidate that "there is nothing
  to look up and nobody else is listening", and the transcript is stored in `session_turns`, sent to
  a model provider, read by us when we are debugging, and scored by M4. The next screen the candidate
  sees already says so — `complete.scoring`: "The whole conversation is recorded" — so v1 was not
  only wrong, it was contradicted one screen later. Product principle 4 is privacy by default and
  principle 1 is a coach's honesty; a comforting falsehood fails both.

  What v2 claims instead, and why each claim is safe to make:

  - **"nothing you say here goes to an employer."** True today and at MVP. The employer talent pool
    is [P3] and opt-in (spec §127). A cohort seat makes progress "visible to the program" (spec §27),
    which is a bootcamp or a hub — not an employer — so the claim holds for those candidates too.
  - **"it is saved, so you can read the whole conversation back."** True: the completion screen
    renders the transcript.
  - **What it deliberately does not say** is anything about who else reads it. Staff sampling
    transcripts for expert blind-scoring is committed in spec §90 and has no consent type and no
    privacy copy yet — it is the M4 blocker in `tasks/todo.md`. Until that is decided we do not know
    what we are allowed to promise, and the honest move is to claim less rather than to guess. **When
    that item is taken, re-read this wording**; it is silent, not settled.
  - It promises no feedback and no score, because M3 produces neither. The screen after the
    interview says what happens next, where it can be accurate.
-#}
Hi — thanks for making the time.
{%- if is_diagnostic %} This is a short diagnostic, so I can see where you are starting from.{% endif %}
I have {{ question_budget }} question{{ "" if question_budget == 1 else "s" }} for you and about
{{ planned_minutes }} minutes, and I may follow up on an answer before we move on.

This is practice, not a real interview — nothing you say here goes to an employer. It is saved, so
you can read the whole conversation back once we are done.

Take your time and answer in your own words. You can skip a question or end the session whenever you
like.

Ready? Here is the first one.
