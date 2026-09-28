import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Wordmark } from "@/components/layout/wordmark";

/**
 * Header for signed-in pages, on the structural DegRon grey bar (ADR-0013). `nav` is omitted
 * during onboarding, where the only way on is forward.
 *
 * `data-nav-surface` re-points --ring at --nav-accent for everything inside the bar; see
 * globals.css, where the page's own #C2410C ring would be 1.46:1 against this grey.
 *
 * `width` must match the column the page under it uses, or the bar's contents sit inset from the
 * content below them: the candidate app reads at `max-w-2xl`, the CMS works at `max-w-5xl`.
 */
export function AppHeader({
  nav,
  width = "max-w-2xl",
}: {
  nav?: ReactNode;
  width?: "max-w-2xl" | "max-w-5xl";
}) {
  return (
    <header data-nav-surface className="bg-nav">
      <div
        className={`mx-auto flex ${width} flex-wrap items-center justify-between gap-x-2 gap-y-1 px-5 py-3 sm:px-8`}
      >
        {/* `shrink-0`: the wordmark is a word, and a word that wraps is a broken mark. A third nav
            link on the CMS bar at 360px was enough to break "Readı" across two lines. */}
        <Wordmark href="/home" className="shrink-0" />
        {/* And the row wraps rather than scrolls, because a scrolling bar at 360px hides a
            destination with nothing to say it is there: an admin carries three links, and the
            third one sat outside the viewport with no affordance at all. */}
        <div className="flex items-center gap-2">
          {nav}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
