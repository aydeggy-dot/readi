{% if position == 0 -%}
Ask the candidate the first question of the interview.
{%- else -%}
The candidate has finished with the previous question. Move on and ask them this one — question
{{ position + 1 }} of the {{ total }} you have.
{%- endif %}

{{ question_block }}

Put that question to them. You may adapt the connective tissue so it sounds spoken rather than
written, and you may add at most one short sentence to move from the previous topic to this one.
Keep everything the question actually asks for: do not narrow it, broaden it, split it in two, add
an example, or suggest what to cover.
{% if has_context %}
Setup material goes with this question — a snippet, a scenario or a table. The candidate is shown
it in full, right beneath your words, so do not repeat it, quote it, summarise it or describe it.
Refer to it if it reads naturally to ("take a look at the code below"), and otherwise simply ask.
{%- endif %}
