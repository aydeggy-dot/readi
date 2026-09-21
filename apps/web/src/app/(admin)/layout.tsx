import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { NavLink } from "@/components/layout/nav-link";
import { SiteFooter } from "@/components/layout/site-footer";
import { QueryProvider } from "@/components/query-provider";
import { t } from "@/i18n";
import { requireUser } from "@/lib/session";

/**
 * The staff side of the app. Same chrome as the candidate app, but a wider column: these are
 * working screens — lists with filters, a rubric with five descriptors per criterion — rather than
 * something to read (ADR-0013, M2 plan decision 5). Still 360px first: nothing here is a table.
 *
 * Each page states its own access rule (`requireAdmin`, `requireContentEditor`); this layout only
 * needs a signed-in user to decide what to put in the bar.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requireUser();
  const editor = me.role === "admin" || me.role === "content_expert";
  return (
    <>
      <AppHeader
        nav={
          <nav aria-label={t("nav.main")} className="flex items-center gap-1 sm:gap-3">
            {editor && <NavLink href="/admin/content">{t("nav.content")}</NavLink>}
            {me.role === "admin" && (
              <NavLink href="/admin" exact>
                {t("nav.admin")}
              </NavLink>
            )}
          </nav>
        }
      />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-6 sm:px-8 sm:py-10">
        <QueryProvider>{children}</QueryProvider>
      </main>
      <SiteFooter className="mx-auto w-full max-w-5xl px-5 pb-8 sm:px-8" />
    </>
  );
}
