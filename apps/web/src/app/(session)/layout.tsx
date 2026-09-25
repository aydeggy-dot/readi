import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { QueryProvider } from "@/components/query-provider";
import { requireUser } from "@/lib/session";

/**
 * The interview's own route group: the header, and **no footer** (the M3 plan).
 *
 * Two reasons for it to be its own group rather than a page inside `(app)`. A composer pinned to the
 * bottom of a `min-h-dvh` column would fight `SiteFooter` for the same space; and during an
 * interview there is nowhere else to go, so the navigation — and the phone tab bar with it — would be
 * an invitation to leave halfway through. The wordmark still goes home, which is the way out.
 */
export default async function SessionLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <QueryProvider>{children}</QueryProvider>
    </div>
  );
}
