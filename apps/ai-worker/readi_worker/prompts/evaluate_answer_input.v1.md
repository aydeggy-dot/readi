The candidate was asked this question:

{{ question_block }}
{% if context_block %}
Material shown with the question:

{{ context_block }}
{% endif %}
Mark it against these criteria. Use the number each one is given here as its `criterion` value, and
return one entry for every criterion listed.

{{ criteria_block }}
{% if ideal_points_block %}
What a strong answer covers, for `covered_points` and `missing_points`:

{{ ideal_points_block }}
{% endif %}
The exchange, in order. `<asked>` is the interviewer, `<answer>` is the candidate:

{{ transcript_block }}
