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

  What v2 claimed, and why each claim was safe to make:

  - **"nothing you say here goes to an employer."** True today and at MVP. The employer talent pool
    is [P3] and opt-in (spec §127). A cohort seat makes progress "visible to the program" (spec §27),
    which is a bootcamp or a hub — not an employer — so the claim holds for those candidates too.
  - **"it is saved, so you can read the whole conversation back."** True: the completion screen
    renders the transcript.
  - **What it deliberately did not say** was anything about who else reads it.

  --------------------------------------------------------------------------------------------
  v3, 2026-09-26, M4 phase 0. **v2's silence has been settled.** v2's header said its silence about
  who else reads a transcript was "silent, not settled", and that the wording had to be re-read when
  the calibration blocker was taken. It has been (ADR-0017): staff reading a candidate's answers is
  now an opt-in consent, `transcript_review`, default off and declinable at no cost.

  So the one new sentence is **conditional on that consent**, and it is the whole reason this is a
  v3 rather than an edit. Two candidates in the same session length now hear two different intros,
  which is correct: they agreed to two different things.

  - **Granted** → the interview says it aloud. A permission buried on a consent screen and never
    mentioned again is the kind of consent that is technically obtained and practically forgotten.
  - **Declined, or never asked** → the sentence is absent, and nothing replaces it. We do not
    reassure them that nobody reads it either: the model provider does, and we do when we are
    debugging, and v1 was retired for making exactly that comforting claim. Absence is the honest
    state, the same way v2's silence was.

  It promises no feedback and no score in the intro itself, because the report is a screen, not a
  turn; the completion screen says what happens next, where it can be accurate.
-#}
Hi — thanks for making the time.
{%- if is_diagnostic %} This is a short diagnostic, so I can see where you are starting from.{% endif %}
I have {{ question_budget }} question{{ "" if question_budget == 1 else "s" }} for you and about
{{ planned_minutes }} minutes, and I may follow up on an answer before we move on.

This is practice, not a real interview — nothing you say here goes to an employer. It is saved, so
you can read the whole conversation back once we are done.
{%- if transcript_review_granted %} You have said we may have someone on our team read your answers
to check that we score you fairly; you can change that in your settings whenever you like.{% endif %}

Take your time and answer in your own words. You can skip a question or end the session whenever you
like.

Ready? Here is the first one.
