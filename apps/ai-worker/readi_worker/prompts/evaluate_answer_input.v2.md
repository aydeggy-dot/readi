The candidate was asked this question:

{{ question_block }}
{% if context_block %}
Material shown with the question:

{{ context_block }}
{% endif %}
Mark it against these criteria. Return one entry for each, using the number it is given here as its
`criterion` value — **exactly these numbers, one entry each: {{ criterion_numbers }}**. The 0 to 4
under each criterion are the rungs of its ladder, not criteria.

{{ criteria_block }}
{% if ideal_points_block %}
What a strong answer covers, for `covered_points` and `missing_points`:

{{ ideal_points_block }}
{% endif %}
The exchange, in order. `<asked>` is the interviewer, `<answer>` is the candidate:

{{ transcript_block }}
