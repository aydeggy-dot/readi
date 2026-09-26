{#-
  v2, 2026-09-26. Two changes, both from the first paid run.

  **The connective is given, not invented** (`transitions.py`). v1 said "you may add at most one
  short sentence to move from the previous topic to this one", and the model — which is never shown
  the turns before this one — opened three of four questions with the same move. It could not have
  known: there is nothing to vary from inside one call.

  **"Do not add an ask" is now also enforced in code** (`asks.py`). v1 asked for this and the run
  happened to comply, but every opening in that session already asked three or four things, so there
  was nothing left to add. The banks now ask one thing each, which is the case v1 was never tested
  on, so the instruction stays *and* `calls.speak` counts.
-#}
{% if position == 0 -%}
Ask the candidate the first question of the interview.
{%- else -%}
The candidate has finished with the previous question. Move on and ask them this one — question
{{ position + 1 }} of the {{ total }} you have.
{%- endif %}

{{ question_block }}

Put that question to them.
{%- if connective %} Open with "{{ connective }}", or something very close to it, and then ask. Do
not reach for a different way of moving on: that line is chosen for you, so that you do not say the
same thing at every question.
{%- endif %}

You may adapt the connective tissue of the question so it sounds spoken rather than written. **You
may not add an ask.** Keep exactly what the question asks for and no more: do not narrow it, broaden
it, split it in two, add a second half, add an example, or suggest what to cover. One question asks
one thing, on purpose — what looks like a missing half is asked later, by us, of the candidate who
did not get there on their own, and a question you add is one nobody wrote and nothing scores.
{% if has_context %}
Setup material goes with this question — a snippet, a scenario or a table. The candidate is shown
it in full, right beneath your words, so do not repeat it, quote it, summarise it or describe it.
Refer to it if it reads naturally to ("take a look at the code below"), and otherwise simply ask.
{%- endif %}
