import { describe, expect, it } from "vitest";
import {
  consentStepPath,
  isCurrentPath,
  nextOnboardingPath,
  safeNextPath,
  isoDateParam,
} from "./navigation";

describe("safeNextPath", () => {
  it.each(["/home", "/profile/edit?x=1", "/onboarding/consent"])("keeps %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    null,
    "",
    "home",
    "//evil.test",
    "/\\evil.test",
    "https://evil.test",
    "/api/auth/sign-out",
  ])("falls back for %s", (next) => {
    expect(safeNextPath(next)).toBe("/home");
  });
});

const ONBOARDED = "2026-09-19T12:00:00.000Z";

/** Every state the three fields can be in — eight, and the loop check needs all of them. */
const EVERY_STATE = [false, true].flatMap((profile_completed) =>
  [false, true].flatMap((consents_completed) =>
    [null, ONBOARDED].map((completed_at) => ({
      profile_completed,
      consents_completed,
      completed_at,
    })),
  ),
);

describe("nextOnboardingPath", () => {
  const state = { profile_completed: true, consents_completed: false, completed_at: null };

  it("starts with the profile", () => {
    expect(nextOnboardingPath({ ...state, profile_completed: false })).toBe("/onboarding/profile");
  });

  it("then asks for consent", () => {
    expect(nextOnboardingPath(state)).toBe("/onboarding/consent");
  });

  it("is done once every consent has been decided", () => {
    expect(nextOnboardingPath({ ...state, consents_completed: true })).toBeNull();
  });

  /**
   * **The regression test for the consent nobody was asked for** (2026-09-27).
   *
   * `transcript_review` joined `allDecided` in M4 phase 0 so that "every existing account is asked
   * once" (ADR-0017). It was asked of nobody, because this function routed on `completed_at` — which
   * every existing account already had — instead of on the decisions. The API was right the whole way
   * down: `state()` returned `consents_completed: false` and `complete()` refused on it. Nothing
   * routed anybody back.
   *
   * It was found by the first paid interview run, where the intro correctly omitted a clause for a
   * consent the owner had never been offered, and it gated M4 phase 6: the calibration sampler draws
   * through `usersGranting("transcript_review")`, which was correct and returned nobody, so the tool
   * would have been built against an empty set and looked like it worked.
   */
  it("sends an account that has already onboarded back for a consent it has never decided", () => {
    expect(
      nextOnboardingPath({
        profile_completed: true,
        consents_completed: false,
        completed_at: ONBOARDED,
      }),
    ).toBe("/onboarding/consent");
  });

  it("does not care about completed_at once the decisions are in", () => {
    // The two states differ only in `completed_at`, and neither has anything outstanding.
    for (const completed_at of [null, ONBOARDED]) {
      expect(
        nextOnboardingPath({ profile_completed: true, consents_completed: true, completed_at }),
      ).toBeNull();
    }
  });
});

describe("consentStepPath", () => {
  it("shows the form when there is something to decide", () => {
    for (const completed_at of [null, ONBOARDED]) {
      expect(
        consentStepPath({ profile_completed: true, consents_completed: false, completed_at }),
      ).toBeNull();
    }
  });

  it("sends somebody with nothing to decide to the editable copy in their profile", () => {
    expect(
      consentStepPath({ profile_completed: true, consents_completed: true, completed_at: null }),
    ).toBe("/profile/consent");
  });

  it("asks for the profile first, because a decision can exist without one", () => {
    expect(
      consentStepPath({ profile_completed: false, consents_completed: true, completed_at: null }),
    ).toBe("/onboarding/profile");
  });

  /**
   * **The redirect loop the one-line fix would have shipped.**
   *
   * `/profile/consent` calls `requireOnboarded()`, which calls `nextOnboardingPath`. So if this
   * function sends somebody to `/profile/consent` from a state that `nextOnboardingPath` answers with
   * `/onboarding/consent`, the two screens bounce a request between them until the browser gives up.
   * That is precisely what happened with the consent page's old guard, which read `completed_at` while
   * the fix made `nextOnboardingPath` read `consents_completed`: an onboarded account with an
   * undecided consent — every existing account, on the day the fix shipped — would have been unable
   * to load any page of the app.
   *
   * Asserted over all eight states rather than the one that bit, because the invariant is what
   * matters: these two functions may not disagree about whether there is something left to ask.
   */
  it("never bounces back to a screen that would send them here again", () => {
    for (const state of EVERY_STATE) {
      if (nextOnboardingPath(state) !== "/onboarding/consent") continue;
      expect(consentStepPath(state), JSON.stringify(state)).not.toBe("/profile/consent");
    }
  });

  it("terminates from every state", () => {
    // Walking the redirects has to reach a page that renders, in a bounded number of hops.
    for (const state of EVERY_STATE) {
      const visited: string[] = [];
      let at: string | null = nextOnboardingPath(state) ?? "(an app page)";
      while (at === "/onboarding/consent" || at === "/profile/consent") {
        expect(visited, `${JSON.stringify(state)} looped via ${visited.join(" → ")}`).not.toContain(
          at,
        );
        visited.push(at);
        // `/onboarding/consent` decides with `consentStepPath`; `/profile/consent` is an app page
        // behind `requireOnboarded`, so it asks `nextOnboardingPath` again.
        at =
          at === "/onboarding/consent"
            ? (consentStepPath(state) ?? "(the consent form)")
            : (nextOnboardingPath(state) ?? "(an app page)");
      }
      expect(at).not.toBe("/onboarding/consent");
    }
  });
});

describe("isoDateParam", () => {
  it("accepts a calendar date only", () => {
    expect(isoDateParam("2026-09-26")).toBe("2026-09-26");
    for (const value of [
      undefined,
      "",
      "2026-13-01",
      "26/09/2026",
      "2026-09-26T00:00",
      ["2026-09-26"],
    ]) {
      expect(isoDateParam(value)).toBeNull();
    }
  });
});

describe("isCurrentPath", () => {
  it("marks the page you are on", () => {
    expect(isCurrentPath("/profile", "/profile")).toBe(true);
    expect(isCurrentPath("/profile/", "/profile")).toBe(true);
  });

  it("marks the section a link owns", () => {
    expect(isCurrentPath("/profile/edit", "/profile")).toBe(true);
    expect(isCurrentPath("/profile/cv", "/profile")).toBe(true);
  });

  it("keeps a section link off when the page belongs to a sibling", () => {
    // /admin and /admin/content sit side by side in the bar, so only one may be current.
    expect(isCurrentPath("/admin/content/questions", "/admin")).toBe(true);
    expect(isCurrentPath("/admin/content/questions", "/admin", { exact: true })).toBe(false);
    expect(isCurrentPath("/admin", "/admin", { exact: true })).toBe(true);
  });

  it("does not let a link claim a path that merely starts with it", () => {
    expect(isCurrentPath("/profiles", "/profile")).toBe(false);
    expect(isCurrentPath("/admin", "/profile")).toBe(false);
  });

  it("keeps the root to itself, so it is not current everywhere", () => {
    expect(isCurrentPath("/", "/")).toBe(true);
    expect(isCurrentPath("/home", "/")).toBe(false);
  });

  it("is false before the pathname is known", () => {
    expect(isCurrentPath(null, "/profile")).toBe(false);
  });
});
