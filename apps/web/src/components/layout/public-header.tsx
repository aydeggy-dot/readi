import type { ReactNode } from "react";
import { Wordmark } from "@/components/layout/wordmark";

/**
 * The bar for pages a signed-out visitor sees, on the same structural grey as the signed-in
 * header, so the product looks like one place before and after signing up (ADR-0013). The auth
 * pages pass no actions: the way on from there is the form.
 *
 * `data-nav-surface` re-points --ring at --nav-accent inside the bar; see globals.css.
 */
export function PublicHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header data-nav-surface className="bg-nav">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-5 py-3 sm:px-8">
        <Wordmark href="/" />
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
