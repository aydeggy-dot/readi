# AI / LLM engineer — question bank blueprint

**Wave 2, first of the wave. Status: planning only — no row in `roles.yaml`, no bank.**
Derived from `docs/role-catalogue.md` § Wave 2. Moved here from wave 3 by the owner on 2026-09-22,
ahead of DevOps and Mobile.

## What the role is

Builds features on top of models someone else trained: prompts, retrieval, structured output,
evaluation, and keeping the cost and the latency inside something a product can pay. The catalogue
rates it **Full** — the conversation _is_ the interview — and notes there is essentially no prep
content anywhere to compete with. Those two together are why it goes first in wave 2.

An interview for it is trying to find out whether the candidate treats a model as a component with
a contract and a failure rate, or as a magic box. The sharpest signal is how they talk about
**evaluation**: a candidate who cannot say how they would know the feature got worse has not shipped
one.

## Levels

| Level         | Catalogue  | Offered at launch                           | Notes                                                                                                              |
| ------------- | ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| intern-junior | not listed | **no**                                      | The catalogue does not list a junior level for this role, and it is right: nobody is hired into it as a first job. |
| mid           | yes        | **yes — and it is the only one**            | The whole bank is written at mid.                                                                                  |
| senior        | yes        | no — the level exists and no role offers it | Where much of the real demand is, and out of reach until the senior content exists.                                |

**This is the first role whose offering is a single level**, which is worth deciding deliberately
rather than discovering: the onboarding picker will show one option. If that reads badly, the answer
is to build senior, not to invent a junior level nobody hires.

## Stack variants — a proposed deviation from the catalogue

The catalogue lists five: Python + Anthropic/OpenAI APIs, TypeScript + the same, LangChain /
LlamaIndex, vector stores (pgvector, Pinecone), agent frameworks.

**Three of those are not variants, they are topics.** A candidate is not interviewed "as a vector
store engineer"; they are interviewed in a language, about retrieval. Proposed:

| Variant                  | Own questions | Why                                                               |
| ------------------------ | ------------- | ----------------------------------------------------------------- |
| `python-llm` _(default)_ | 3             | Where most of this work is written.                               |
| `typescript-llm`         | 3             | And where a lot of _product_ LLM work is written, including ours. |

with `langchain-llamaindex`, vector stores and agent frameworks becoming **topics** —
`tool-use-agents`, `rag` — asked of everyone. A framework question tagged to a framework variant
would hide retrieval from the candidates who did not pick it, which is the same mistake as tagging
QA's general set `manual-exploratory`.

Owner's call, and cheap either way: it is two rows in `stacks.yaml` versus five.

## Core topics

Nine from the catalogue, of which one already exists — `observability` is the same topic backend
needs, and a topic is shared across roles by design.

| Topic slug                 | Core | In `topics.yaml`              | Covers                                                                                 |
| -------------------------- | ---- | ----------------------------- | -------------------------------------------------------------------------------------- |
| `prompt-design`            | yes  | **new**                       | Instructions, examples, delimiting untrusted input, what belongs in a system prompt    |
| `structured-output`        | yes  | **new**                       | Schema-validated output, what to do with an invalid one, retries that are not infinite |
| `rag`                      | yes  | **new**                       | Chunking, embeddings, retrieval quality, and when retrieval is the wrong tool          |
| `llm-evaluation`           | yes  | **new**                       | Regression sets, agreement with human judgement, what "it got worse" means             |
| `llm-guardrails`           | yes  | **new**                       | Prompt injection, refusals, output that must never ship, defence in depth              |
| `llm-cost-latency`         | yes  | **new**                       | Token cost, streaming, caching, model choice as a budget decision                      |
| `tool-use-agents`          | yes  | **new**                       | Tool definitions, loops that terminate, what an agent must never be allowed to do      |
| `fine-tuning-vs-prompting` | yes  | **new**                       | When each is the answer, and what fine-tuning actually costs                           |
| `observability`            | yes  | **new (shared with backend)** | Tracing a call, knowing which version produced an answer                               |
| `collaboration`            | yes  | yes                           | Shared behavioural rubric                                                              |

## What the engine can deliver

Proposed `supported_question_types`: `technical, scenario, behavioral`.

| Round a real interview has                                  | Can we?                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Design an LLM feature, out loud                             | **Yes** — this is the role's central round and it is pure conversation       |
| "Here is a prompt that misbehaves — what is wrong with it?" | **Yes** — the prompt goes in `context`, like a code snippet                  |
| Evaluation and failure analysis                             | **Yes**                                                                      |
| Behavioural                                                 | **Yes**                                                                      |
| Writing the code live                                       | **No** — code editor is P2, and it matters less for this role than any other |

**Nothing structural is missing.** This is the only wave-2 role of which that is true.

## The risk that is specific to this role

**Its content ages faster than any other bank in the product**, and a stale AI question is worse
than no AI question because the candidate repeats it in a real interview. Two rules for the bank,
enforced in review:

- **No model names, no prices, no context-window sizes, no benchmark numbers** in a question, an
  ideal point or a rubric descriptor. Ask what the candidate would do about cost, never what a
  thousand tokens costs.
- **Every question dated in the fact-check log**, and the whole bank re-read at each milestone
  rather than when someone notices.

## Target counts

Ten topics at one level, floor of two: **20 general slots ≈ 18 general questions**, plus **6 stack
slots ≈ 6 questions** across the two language variants.

```yaml
# targets (read by check-bank.mjs)
role: ai-llm
levels: [mid]
general_by_topic:
  prompt-design: { mid: 2 }
  structured-output: { mid: 2 }
  rag: { mid: 3 }
  llm-evaluation: { mid: 3 }
  llm-guardrails: { mid: 2 }
  llm-cost-latency: { mid: 2 }
  tool-use-agents: { mid: 2 }
  fine-tuning-vs-prompting: { mid: 1 }
  observability: { mid: 2 }
  collaboration: { mid: 2 }
by_stack:
  python-llm: 3
  typescript-llm: 3
complete: false
```

`rag` and `llm-evaluation` earn three: retrieval is where most of the real work is, and evaluation
is the dimension that separates someone who has shipped from someone who has read. `fine-tuning-vs-
prompting` earns one: it is a single judgement, asked once.

|                   | General | Stack-tagged | Total   |
| ----------------- | ------- | ------------ | ------- |
| AI / LLM engineer | ~19     | ~6           | **~25** |

## Out of scope, deliberately

- **Junior and senior**, for the reasons above.
- **Training and fine-tuning in depth.** That is the ML engineer's interview (wave 4) and a
  different role; one question about _when_ to fine-tune is the boundary.
- **Anything that needs a notebook or a GPU.**

---

## Appendix A — fact-check log · Appendix B — critique passes · Appendix C — coverage

_Filled when the bank is written._
