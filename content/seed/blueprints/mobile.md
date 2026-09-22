# Mobile engineer — question bank blueprint

**Wave 2. Status: planning only — no row in `roles.yaml`, no bank.**
Derived from `docs/role-catalogue.md` § Wave 2.

## What the role is

Builds the app on the device. Nigeria is phone-first, so this is both local product work and a real
remote market — and it is the role where this product's own audience assumptions stop being a
constraint and become the subject: mid-range Android, a connection that drops, a battery that has to
last the day, and a 60 MB download that nobody on a metered plan will accept.

An interview for it is trying to find out whether the candidate builds for that device or for the
emulator on their laptop.

## Levels

| Level         | Catalogue | Offered at launch             | Notes |
| ------------- | --------- | ----------------------------- | ----- |
| intern-junior | junior    | yes                           |       |
| mid           | yes       | yes                           |       |
| senior        | yes       | no — no role offers the level |       |

## Stack variants

Four, and unlike AI/LLM and DevOps these are **genuine** variants: a Flutter candidate and a Kotlin
candidate are not interviewed alike, and nothing about Dart transfers to Swift.

| Variant                    | Own questions | Why                                                                                                                                                                                  |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `react-native` _(default)_ | 3             | The most common route here, and the one JavaScript developers cross into.                                                                                                            |
| `flutter`                  | 3             | Widely used locally, and genuinely disjoint from React Native.                                                                                                                       |
| `android-kotlin`           | 2             | Native Android is what a phone-first market actually runs on.                                                                                                                        |
| `ios-swift`                | 1             | The narrowest here by employer count, and the most expensive to prepare for — a candidate needs a Mac. Worth asking a reviewer whether to offer it at all rather than half-serve it. |

This is the role with the highest stack-tagged share of any bank: roughly a third of the questions,
against a tenth for QA.

## Core topics

Four existing topics carry over, which is the best reuse in the catalogue — and one of them only
works if `react-state` is renamed to "Component state and data flow" as `frontend.md` proposes.

| Topic slug           | Core | In `topics.yaml`       | Covers                                                                                 |
| -------------------- | ---- | ---------------------- | -------------------------------------------------------------------------------------- |
| `app-lifecycle`      | yes  | **new**                | Foreground, background, killed, restored — the states a phone puts an app through      |
| `react-state`        | yes  | yes _(rename pending)_ | State management, shared with frontend once the name is framework-neutral              |
| `navigation`         | yes  | **new**                | Stacks, tabs, deep links, and the back button                                          |
| `offline-storage`    | yes  | **new**                | Local storage, sync, conflict, and an app that is useful with no signal                |
| `web-networking`     | yes  | yes                    | Requests on an unreliable connection — the same topic frontend uses                    |
| `mobile-performance` | yes  | **new**                | Startup time, jank, battery, and app size on a metered plan                            |
| `release-and-store`  | yes  | **new**                | Store review, staged rollout, and what you do about the version people will not update |
| `push-notifications` | yes  | **new**                | Permission, delivery, and not being uninstalled for it                                 |
| `mobile-testing`     | yes  | **new**                | Devices, emulators, and what is worth automating                                       |
| `debugging`          | yes  | yes                    | Shared with frontend                                                                   |
| `collaboration`      | yes  | yes                    | Shared behavioural rubric                                                              |

**New topic rows: seven.** Four reused, which is the argument for topics being shared rather than
owned by a role.

## What the engine can deliver

Proposed `supported_question_types`: `technical, scenario, behavioral`.

| Round a real interview has                           | Can we?                                        |
| ---------------------------------------------------- | ---------------------------------------------- |
| Concepts, lifecycle, trade-offs                      | **Yes**                                        |
| "The app crashes only on Android 11, only sometimes" | **Yes** — the role's best conversational round |
| Behavioural                                          | **Yes**                                        |
| Build a screen live                                  | **No** — code editor is P2                     |

## Target counts

```yaml
# targets (read by check-bank.mjs)
role: mobile
levels: [intern-junior, mid]
general_by_topic:
  app-lifecycle: { intern-junior: 2, mid: 2 }
  react-state: { intern-junior: 2, mid: 2 }
  navigation: { intern-junior: 2, mid: 2 }
  offline-storage: { intern-junior: 2, mid: 2 }
  web-networking: { intern-junior: 2, mid: 2 }
  mobile-performance: { intern-junior: 2, mid: 2 }
  release-and-store: { intern-junior: 1, mid: 2 }
  push-notifications: { intern-junior: 1, mid: 2 }
  mobile-testing: { intern-junior: 2, mid: 2 }
  debugging: { intern-junior: 2, mid: 2 }
  collaboration: { intern-junior: 2, mid: 2 }
by_stack:
  react-native: 3
  flutter: 3
  android-kotlin: 2
  ios-swift: 1
complete: false
```

Two deviations at intern-junior — `release-and-store` and `push-notifications` — because a junior
has usually shipped through someone else's account and configured neither.

|        | General | Stack-tagged | Total   |
| ------ | ------- | ------------ | ------- |
| Mobile | ~21     | ~9           | **~30** |

Questions on `web-networking`, `debugging` and `react-state` should be written so that a **frontend
candidate could be asked them too**, and carry both roles where that holds. A question about
requests on a dropping connection is the same question on both sides of this catalogue.

## Out of scope, deliberately

- **Senior**, and live coding.
- **Anything needing a device farm.** Questions about testing on real devices ask how the candidate
  would decide what to test on, not for results.

---

## Appendix A — fact-check log · Appendix B — critique passes · Appendix C — coverage

_Filled when the bank is written._
