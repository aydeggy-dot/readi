import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Wordmark } from "@/components/layout/wordmark";

/**
 * Header for signed-in pages, on the structural DegRon grey bar (ADR-0013). `nav` is omitted
 * during onboarding, where the only way on is forward.
 *
 * `data-nav-surface` re-points --ring at --nav-accent for everything inside the bar; see
 * globals.css, where the page's own #C2410C ring would be 1.46:1 against this grey.
 */
export function AppHeader({ nav }: { nav?: ReactNode }) {
  return (
    <header data-nav-surface className="bg-nav">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-5 py-3 sm:px-8">
        <Wordmark href="/home" />
        <div className="flex items-center gap-2">
          {nav}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
