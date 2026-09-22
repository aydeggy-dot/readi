# Blueprints

One per role: what its question bank should contain, and why that and not something else. Written
**before** any question is drafted, and reconciled against the bank afterwards by
`node .claude/skills/question-bank/scripts/check-bank.mjs`.

They are **markdown, not YAML**, because the seed loader validates every `.yaml` under
`content/seed` as a seed file. Nothing here is imported; nothing here reaches a candidate.

A blueprint answers, for one role: which levels we write for, which stack variants justify their own
questions, which topics are core, what the engine can and cannot deliver, and how many questions
that adds up to. The floor everywhere is **two questions per core topic, available at each level the
role offers** — because a candidate who practises a topic twice should not meet the same question
twice. A question carrying both levels counts for both.

Each blueprint carries a fenced `targets` block, which is the only machine-readable part:

```yaml
# targets (read by check-bank.mjs)
role: frontend
levels: [intern-junior, mid]
general_by_topic:
  javascript-fundamentals: { intern-junior: 2, mid: 2 }
by_stack:
  react-typescript: 3
complete: false
```

`complete: true` (or `--strict`) turns a shortfall from a warning into an error. Until a bank is
meant to be finished, it stays `false` and the checker reports the distance.

| Wave | Role                            | Blueprint                              | Bank                                |
| ---- | ------------------------------- | -------------------------------------- | ----------------------------------- |
| 1    | Frontend engineer               | [`frontend.md`](frontend.md)           | 8 questions, extending              |
| 1    | Backend engineer                | [`backend.md`](backend.md)             | 3 questions, extending              |
| 1    | QA engineer                     | [`qa.md`](qa.md)                       | 3 questions, extending              |
| 1    | Full-stack engineer             | [`fullstack.md`](fullstack.md)         | 11 borrowed, no track               |
| 2    | AI / LLM engineer               | [`ai-llm.md`](ai-llm.md)               | none                                |
| 2    | DevOps / Cloud engineer         | [`devops-cloud.md`](devops-cloud.md)   | none                                |
| 2    | Mobile engineer                 | [`mobile.md`](mobile.md)               | none                                |
| 2    | Data analyst                    | [`data-analyst.md`](data-analyst.md)   | none — **blocked on a SQL surface** |
| 3    | Data engineer                   | [`data-engineer.md`](data-engineer.md) | none                                |
| 3    | Cybersecurity / SOC analyst     | [`cybersecurity.md`](cybersecurity.md) | none                                |
| 3    | Technical PM / Business analyst | [`tpm-ba.md`](tpm-ba.md)               | none                                |
| 3    | Technical support engineer      | [`tech-support.md`](tech-support.md)   | none                                |
| 4    | Eight roles, one line each      | [`wave-4.md`](wave-4.md)               | none                                |

Waves and their order are `docs/role-catalogue.md`; the method is
`.claude/skills/question-bank/SKILL.md`.
