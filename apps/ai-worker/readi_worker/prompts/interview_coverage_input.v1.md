The candidate was asked:

{{ question_block }}

{% if probed_before -%}
They have already been asked, and have answered, this follow-up:

{{ probed_before }}

{% endif -%}
Their most recent answer:

{{ answer_block }}

Decide, for each of these follow-ups, whether that answer already addresses it. Use the number each
one is given here as its `probe` value, and return one entry per follow-up.

{{ probes_block }}
