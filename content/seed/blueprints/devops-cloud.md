# DevOps / Cloud engineer — question bank blueprint

**Wave 2. Status: planning only — no row in `roles.yaml`, no bank.**
Derived from `docs/role-catalogue.md` § Wave 2.

## What the role is

Runs what the engineers write: the pipeline that ships it, the infrastructure it lands on, and the
pager that goes off when it stops. Demand here consistently outruns supply and the remote market is
strong, which is why it sits in the first expansion.

An interview for it is trying to find out whether the candidate has been on call. The best signal is
an **incident walkthrough** — "the deploy went out and error rates tripled, talk me through your
first ten minutes" — which is exactly the shape our engine is best at, and why the catalogue rates
the fit **Most** despite the missing labs.

## Levels

| Level         | Catalogue | Offered at launch             | Notes                                                                                       |
| ------------- | --------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| intern-junior | junior    | yes                           | A real entry route here, usually from support or sysadmin work rather than from a bootcamp. |
| mid           | yes       | yes                           |                                                                                             |
| senior        | yes       | no — no role offers the level |                                                                                             |

## Stack variants — the same proposed deviation as AI/LLM

The catalogue lists six: AWS, Azure, GCP, Docker + Kubernetes, Terraform, GitHub Actions / GitLab CI.

**Three of those are topics, not variants.** Everyone in this role needs containers, infrastructure
as code and CI/CD; only the cloud is genuinely a fork in the road, and it is the fork employers
advertise. Proposed:

| Variant           | Own questions | Why                                                                                       |
| ----------------- | ------------- | ----------------------------------------------------------------------------------------- |
| `aws` _(default)_ | 3             | What most job posts here name.                                                            |
| `azure`           | 2             | Banking and enterprise, and the Microsoft shops that come with it.                        |
| `gcp`             | 1             | Narrowest of the three locally; the one to check with a reviewer before writing a second. |

with Kubernetes, Terraform and CI tooling as **topics** asked of everyone. A Terraform question
hidden behind a Terraform variant would be invisible to exactly the candidates who need to learn it.

## Core topics

| Topic slug               | Core | In `topics.yaml`                      | Covers                                                                                     |
| ------------------------ | ---- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `linux-fundamentals`     | yes  | **new**                               | Processes, permissions, disk, logs — what you do with a shell on a box that is misbehaving |
| `networking`             | yes  | **new**                               | DNS, TLS, ports, routing, and why "it works from my laptop"                                |
| `containers`             | yes  | **new**                               | Images, layers, what belongs in one, and what does not                                     |
| `orchestration`          | yes  | **new**                               | Kubernetes: scheduling, health checks, rollouts, and when it is too much machinery         |
| `infrastructure-as-code` | yes  | **new**                               | Terraform: state, drift, review, and blast radius                                          |
| `ci-cd`                  | yes  | **new**                               | Pipelines, artefacts, environments, and deploys you can undo                               |
| `observability`          | yes  | **new (shared with backend, AI/LLM)** | Metrics, logs, traces, and alerts a human should actually be woken by                      |
| `incident-response`      | yes  | **new**                               | The first ten minutes, comms, rollback, and the postmortem afterwards                      |
| `cloud-cost`             | yes  | **new**                               | Where the bill comes from, and the trade-off against reliability                           |
| `security-basics`        | yes  | **new**                               | Secrets, least privilege, patching, and the shape of a breach                              |
| `collaboration`          | yes  | yes                                   | Shared behavioural rubric                                                                  |

Ten new topics is the largest catalogue addition of any role in waves 1–3, and four of them
(`observability`, `ci-cd`, `containers`, `networking`) are reused by backend, QA and data
engineering. Adding them is cheap; leaving them out and inventing role-specific near-duplicates
later is not.

## What the engine can deliver

Proposed `supported_question_types`: `technical, scenario, behavioral`.

| Round a real interview has                      | Can we?                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| Incident walkthrough                            | **Yes** — the best conversational round on the whole catalogue after QA's |
| Architecture and trade-offs, spoken             | **Yes**                                                                   |
| Behavioural, including on-call and blame        | **Yes**                                                                   |
| "Here is a broken manifest / pipeline file"     | **Yes** — it goes in `context`                                            |
| Hands-on lab: fix the cluster, write the module | **No** — ephemeral containers are P3                                      |

The role's page must say the lab round is not covered. For this role the gap is real: a good number
of employers here do set a practical task.

## Target counts

Eleven topics × two levels, floor of two, with `incident-response` earning three at mid because it
is the round the role turns on:

```yaml
# targets (read by check-bank.mjs)
role: devops-cloud
levels: [intern-junior, mid]
general_by_topic:
  linux-fundamentals: { intern-junior: 2, mid: 2 }
  networking: { intern-junior: 2, mid: 2 }
  containers: { intern-junior: 2, mid: 2 }
  orchestration: { intern-junior: 1, mid: 2 }
  infrastructure-as-code: { intern-junior: 1, mid: 2 }
  ci-cd: { intern-junior: 2, mid: 2 }
  observability: { intern-junior: 2, mid: 2 }
  incident-response: { intern-junior: 2, mid: 3 }
  cloud-cost: { intern-junior: 1, mid: 2 }
  security-basics: { intern-junior: 2, mid: 2 }
  collaboration: { intern-junior: 2, mid: 2 }
by_stack:
  aws: 3
  azure: 2
  gcp: 1
complete: false
```

Three deviations from the floor at intern-junior — `orchestration`, `infrastructure-as-code` and
`cloud-cost` — because a junior is fairly asked what a rollout or a state file _is_ and what it is
for, and is not fairly asked to own either.

|                | General | Stack-tagged | Total   |
| -------------- | ------- | ------------ | ------- |
| DevOps / Cloud | ~22     | ~6           | **~28** |

## Out of scope, deliberately

- **Senior.**
- **Anything that needs a lab.** No "write the Terraform module", no "debug this cluster".
- **Offensive security.** The boundary the cybersecurity blueprint states applies here too: this
  bank is defensive and analytical only (spec §10).

---

## Appendix A — fact-check log · Appendix B — critique passes · Appendix C — coverage

_Filled when the bank is written._
