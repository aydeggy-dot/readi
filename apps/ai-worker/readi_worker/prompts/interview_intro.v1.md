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
-#}
Hi — thanks for making the time.
{%- if is_diagnostic %} This is a short diagnostic, so I can see where you are starting from.{% endif %}
I have {{ question_budget }} question{{ "" if question_budget == 1 else "s" }} for you and about
{{ planned_minutes }} minutes, and I may follow up on an answer before we move on.

Take your time and answer in your own words — there is nothing to look up and nobody else is
listening. You can skip a question or end the session whenever you like.

Ready? Here is the first one.
