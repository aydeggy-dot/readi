# Cybersecurity / SOC analyst — question bank blueprint

**Wave 3. Status: planning only — no row in `roles.yaml`, no bank.**
Derived from `docs/role-catalogue.md` § Wave 3.

## What the role is

Watches, triages and responds. The catalogue calls it the largest reported skills gap in the country
with strong entry-level demand, and the interview is almost entirely conversation: "here is an
alert, what do you do?"

## The content boundary, first

**This bank is defensive and analytical only.** No offensive tooling walkthroughs, no exploitation
steps, no "how would you get in" (spec §10, and the catalogue states it as a boundary rather than a
preference). A question may ask a candidate to _recognise_ an attack, to reason about what an
attacker would try next, and to say what they would do about it. It may not ask them to demonstrate
one.

This is the only role on the catalogue that needs a rule like this written into its blueprint, and
it should be repeated in the file header of the bank when it is written, because it is the sort of
boundary a well-meaning drafter erodes one question at a time.

## Levels

| Level         | Catalogue  | Would offer | Notes                                                    |
| ------------- | ---------- | ----------- | -------------------------------------------------------- |
| intern-junior | junior     | yes         | A genuine entry route, often from support or networking. |
| mid           | yes        | yes         |                                                          |
| senior        | not listed | no          |                                                          |

## Stack variants

| Variant                | Would write | Why                                                                                                  |
| ---------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `soc-siem` _(default)_ | 3           | Splunk, Sentinel — the entry job most people here are hired into.                                    |
| `appsec`               | 2           | OWASP, Burp; overlaps the engineering roles and is where a developer crosses over.                   |
| `cloud-security`       | 2           | Follows the DevOps wave.                                                                             |
| `grc`                  | 2           | Compliance work is a real, well-paid and under-served route here, and the one least like the others. |

## Core topics

| Topic slug            | Core | New?               | Covers                                                                                |
| --------------------- | ---- | ------------------ | ------------------------------------------------------------------------------------- |
| `owasp-top-10`        | yes  | new                | The classes of application flaw, and what each one costs                              |
| `networking`          | yes  | shared with DevOps | The layer most SOC work actually happens at                                           |
| `threat-detection`    | yes  | new                | Signals, false positives, and the alert nobody reads                                  |
| `incident-response`   | yes  | shared with DevOps | Triage, containment, comms, and the write-up                                          |
| `identity-access`     | yes  | new                | Identity, least privilege, MFA, and the joiner/leaver problem                         |
| `cryptography-basics` | yes  | new                | What encryption does and does not protect                                             |
| `compliance`          | yes  | new                | **NDPA 2023**, ISO 27001, PCI DSS — and local compliance is a feature, not a footnote |
| `secure-sdlc`         | yes  | new                | Security as part of building, which is where it overlaps every engineering role       |
| `collaboration`       | yes  | existing           | Shared behavioural rubric                                                             |

`compliance` is the topic where this product knows something: the NDPA is the law Readi itself is
built to (CLAUDE.md §5), and a bank that treats compliance as a Western-framework checklist would
miss the thing local employers actually ask about.

## What the engine can deliver

Proposed `supported_question_types`: `technical, scenario, behavioral`.

| Round a real interview has                       | Can we?                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| "Triage this alert"                              | **Yes** — the central round, and pure conversation                   |
| Incident walkthrough                             | **Yes**                                                              |
| Concepts and trade-offs                          | **Yes**                                                              |
| Behavioural, including reporting bad news upward | **Yes**                                                              |
| A capture-the-flag or a hands-on lab             | **No** — and out of scope by the boundary above, not only by tooling |

**Nothing structural is missing**, which with QA, AI/LLM, TPM/BA and support makes five roles whose
whole interview our engine can hold.

## Target counts

```yaml
# targets (read by check-bank.mjs)
role: cybersecurity
levels: [intern-junior, mid]
general_by_topic:
  owasp-top-10: { intern-junior: 2, mid: 2 }
  networking: { intern-junior: 2, mid: 2 }
  threat-detection: { intern-junior: 2, mid: 3 }
  incident-response: { intern-junior: 2, mid: 3 }
  identity-access: { intern-junior: 2, mid: 2 }
  cryptography-basics: { intern-junior: 2, mid: 2 }
  compliance: { intern-junior: 2, mid: 2 }
  secure-sdlc: { intern-junior: 1, mid: 2 }
  collaboration: { intern-junior: 2, mid: 2 }
by_stack:
  soc-siem: 3
  appsec: 2
  cloud-security: 2
  grc: 2
complete: false
```

|               | General | Stack-tagged | Total   |
| ------------- | ------- | ------------ | ------- |
| Cybersecurity | ~19     | ~9           | **~28** |

## Out of scope, deliberately

- **Everything on the offensive side of the boundary above.**
- **Senior**, and labs.

---

## Appendix A — fact-check log · Appendix B — critique passes · Appendix C — coverage

_Filled when the bank is written._
