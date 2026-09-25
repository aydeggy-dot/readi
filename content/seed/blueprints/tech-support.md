# Technical support engineer — question bank blueprint

**Wave 3. Status: planning only — no row in `roles.yaml`, no bank.**
Derived from `docs/role-catalogue.md` § Wave 3.

## What the role is

The first rung into tech for a very large number of people, very remote-friendly, and rated **Full**
by the catalogue: the interview is troubleshooting out loud and talking to a customer, both of which
are conversation.

It is the role with the widest audience and the lowest barrier on the whole list, which makes it the
one where a good bank helps the most people per question written.

## Levels

| Level         | Catalogue  | Would offer | Notes                            |
| ------------- | ---------- | ----------- | -------------------------------- |
| intern-junior | junior     | yes         | The main audience by a distance. |
| mid           | yes        | yes         |                                  |
| senior        | not listed | no          |                                  |

## Stack variants

| Variant                     | Would write | Why                                                                |
| --------------------------- | ----------- | ------------------------------------------------------------------ |
| `helpdesk-itsm` _(default)_ | 2           | Ticketing, SLAs, escalation — the entry job.                       |
| `saas-support`              | 3           | The remote-friendly one, and where the money is for this audience. |
| `cloud-support`             | 2           | The bridge into DevOps, and worth writing so the path is visible.  |

## Core topics

Two reused: `networking` from DevOps and cybersecurity, and `collaboration`.

| Topic slug               | Core | New?     | Covers                                                                    |
| ------------------------ | ---- | -------- | ------------------------------------------------------------------------- |
| `troubleshooting-method` | yes  | new      | Narrowing down rather than guessing — the whole interview in one topic    |
| `networking`             | yes  | shared   | DNS, connectivity, "is it down for everyone or just me"                   |
| `operating-systems`      | yes  | new      | Processes, permissions, disk, and where the logs are                      |
| `ticketing-escalation`   | yes  | new      | When to escalate, what to hand over, and what the next person needs       |
| `reading-logs`           | yes  | new      | Finding the line that matters in a wall of them                           |
| `customer-communication` | yes  | new      | Explaining a fault to someone angry, and not promising what you cannot do |
| `documentation`          | yes  | new      | Writing the answer down so the ticket is not asked again                  |
| `collaboration`          | yes  | existing | Shared behavioural rubric                                                 |

## What the engine can deliver

Proposed `supported_question_types`: `scenario, behavioral, technical`.

| Round a real interview has                                   | Can we?                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| "A customer says X — what do you ask and what do you check?" | **Yes** — the central round                               |
| Troubleshooting walkthrough                                  | **Yes**                                                   |
| Customer communication, including a bad-news message         | **Yes**, and voice mode (M5) makes it genuinely realistic |
| Behavioural                                                  | **Yes**                                                   |
| A shared screen with a broken machine                        | **No** — and rarely used at this level                    |

**Nothing structural is missing.**

## The rubric dimension nobody else has

Support is scored partly on **tone**: patience, clarity, not blaming the customer, not over-promising.
That is a legitimate dimension and it is also the easiest place in the whole product to build a
rubric that scores accent and idiom rather than communication. Whichever bank is written for this
role, the fairness pass and the fifth stress-test answer — the same substance in Nigerian English —
matter more here than anywhere else. A descriptor that says "speaks professionally" is a defect; one
that says "tells the customer what will happen next and by when" is not.

## Target counts

```yaml
# targets (read by check-bank.mjs)
role: tech-support
levels: [intern-junior, mid]
general_by_topic:
  troubleshooting-method: { intern-junior: 3, mid: 3 }
  networking: { intern-junior: 2, mid: 2 }
  operating-systems: { intern-junior: 2, mid: 2 }
  ticketing-escalation: { intern-junior: 2, mid: 2 }
  reading-logs: { intern-junior: 2, mid: 2 }
  customer-communication: { intern-junior: 3, mid: 3 }
  documentation: { intern-junior: 2, mid: 2 }
  collaboration: { intern-junior: 2, mid: 2 }
by_stack:
  helpdesk-itsm: 2
  saas-support: 3
  cloud-support: 2
complete: false
```

|                   | General | Stack-tagged | Total   |
| ----------------- | ------- | ------------ | ------- |
| Technical support | ~19     | ~7           | **~26** |

## Out of scope, deliberately

- **Senior.**
- **Product-specific support questions.** A bank about one vendor's console ages instantly and
  teaches nothing transferable.

---

## Appendix A — fact-check log · Appendix B — critique passes · Appendix C — coverage

_Filled when the bank is written._
