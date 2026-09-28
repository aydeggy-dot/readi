# The consent nobody was asked for, and the loop the one-line fix would have shipped

**2026-09-27, M4 phase 4.7, branch `feat/m4-evaluation`.** The blocker the first paid evaluation run
exposed (`2026-09-27-m4-first-paid-evaluation.md` §3), fixed. It gated phase 6.

## What was broken

`transcript_review` joined `allDecided` in phase 0 so that "every existing account is asked once",
which is what ADR-0017 promises. **It was asked of nobody.** The owner's account had four consent
records from 2026-09-19 and no `transcript_review` row of either kind, and the interview intro
correctly omitted its v3 clause because `hasGranted` correctly returned false.

Everything on the API side was right the whole way down. `ConsentsService.allDecided` returned false,
`OnboardingService.state` returned `consents_completed: false`, and `complete()` refused on it. What
was missing was any route back:

```ts
export function nextOnboardingPath(state: OnboardingState): string | null {
  if (!state.profile_completed) return "/onboarding/profile";
  if (!state.completed_at) return "/onboarding/consent";   // ← set on 2026-09-19
  return null;
}
```

`completed_at` answers "did onboarding happen", which is a different question from "is anything
outstanding". Routing on it meant a consent type that did not exist when an account onboarded could
never reach that account.

## The fix is not one line

The handover proposed `if (!state.consents_completed) return "/onboarding/consent";` and flagged that
`/onboarding/consent` needed checking for a redirect loop. **There is one**, and it would have taken
the whole app down for every existing account on the day it shipped:

```
/home            → requireOnboarded → nextOnboardingPath → /onboarding/consent
/onboarding/consent → `if (me.onboarding.completed_at) redirect("/profile/consent")`
/profile/consent → requireOnboarded → nextOnboardingPath → /onboarding/consent
                 → …
```

The consent page bounced anybody with `completed_at` to the editable copy in their profile; that page
is an ordinary app page behind `requireOnboarded`. So the two screens read **different facts** about
whether there was anything left to ask, and the moment they disagreed a request ping-ponged between
them until the browser gave up. Every signed-in account was in exactly that state.

So the fix is two changes and one new pure function:

- **`nextOnboardingPath` routes on `consents_completed`**, not `completed_at`. This also makes a future
  `CONSENT_VERSIONS` bump re-ask, which is the same promise in its general form: a decision about
  wording nobody has seen is not a decision.
- **`consentStepPath(state)`** is new, pure, and sits beside it: where `/onboarding/consent` sends a
  visitor, or null to render the form. It reads the *same* fact, so the loop is closed by construction
  rather than by care — and because it is pure, the invariant is assertable.
- The consent page calls it instead of guarding inline, and stays on `requireUser` rather than
  `requireOnboarded`, because an onboarded account can legitimately be there now.

`/onboarding/profile` and `/onboarding/cv` still guard on `completed_at`, correctly: a profile and a CV
are not versioned consents, and there is nothing to re-ask. Neither loops — `/profile/edit` and
`/profile/cv` bounce a re-asked account to `/onboarding/consent`, which renders.

## The tests

`navigation.test.ts`, and both were **watched failing** by putting the bug back:

- the regression test the handover named — `nextOnboardingPath` for an account with `completed_at` set
  and `consents_completed` false must not be null;
- **the loop invariant, over all eight states** the three fields can be in: `consentStepPath` may not
  answer `/profile/consent` for a state that `nextOnboardingPath` answers with `/onboarding/consent`;
- **a termination walk**, also over all eight: following the redirects from any state reaches a page
  that renders, and revisiting a path is the failure. With the bug restored it reports
  `{"profile_completed":true,"consents_completed":false,"completed_at":"2026-09-19T12:00:00.000Z"}
  looped via /onboarding/consent → /profile/consent` — which is the owner's own account.

## What the re-asked candidate actually sees

Checked by reading the form rather than assumed, because two things could have gone wrong and neither
did:

- **Their earlier decisions are preserved.** `ConsentForm` pre-ticks from `getConsents()`, so the four
  consents decided in 2026-09-19 come back ticked and are resubmitted as granted. Only
  `transcript_review`, which has no record, is unticked. Nobody silently loses a consent by being
  re-asked.
- **"No" is expressible and is enough.** The form submits a decision for *every* `CONSENT_TYPES` entry,
  so leaving the new one unticked records an explicit `granted: false` — `allDecided` becomes true and
  they are through. ADR-0017's "refusable at no cost" holds.
- **Continue does not break.** `mode="onboarding"` also calls `POST /api/me/onboarding/complete`, which
  is idempotent and returns early when `completed_at` is set. No error path.

They do see the onboarding step indicator on the way through, which is a little odd for an account
that onboarded a week ago but is honest: there is an onboarding step outstanding.

## Not done

- **No e2e test for the re-ask itself.** Reaching that state needs an onboarded account with an
  undecided consent, which means either a new consent type or deleting a consent row from the database —
  the e2e specs talk to the app through the browser and the API, not to Postgres. The chain is covered
  at the unit level end to end instead: `allDecided` (`consents.service.spec.ts`), the routing (here,
  exhaustively), and the form's submit (existing).

  **But no e2e spec depended on the old routing, and that is checked rather than reasoned.** Three
  places touch the consent screen — `helpers.ts`'s `onboard()`, which clicks Continue with nothing
  ticked (recording an explicit `false` for every type, so `allDecided` is satisfied and `/home` is
  reachable); `onboarding.spec.ts`, which asserts the CV step lands on `/onboarding/consent`; and the
  visual capture's screen 13, photographed in the `mid` state (profile filled, no decisions), which
  still renders. `pnpm test:e2e onboarding` passes on the new routing, including the whole sign-up →
  profile → CV → consent → home walk.
- **Phase 6 is unblocked but nothing has been asked yet.** `usersGranting("transcript_review")` will
  keep returning nobody until accounts actually pass through the screen. The owner's own account is the
  first one, on the next page load.
