import type { ReactNode } from "react";
import { QueryProvider } from "@/components/query-provider";
import { SiteFooter } from "@/components/layout/site-footer";
import { AppHeader } from "@/components/layout/app-header";
import { NavLink } from "@/components/layout/nav-link";
import { t } from "@/i18n";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await requireUser();
  return (
    <>
      <AppHeader
        nav={
          <nav aria-label={t("nav.main")} className="flex items-center gap-1 sm:gap-3">
            <NavLink href="/profile">{t("nav.profile")}</NavLink>
            {/* One way into the staff side, whichever staff role it is; /admin links on to the CMS. */}
            {me.role === "admin" && <NavLink href="/admin">{t("nav.admin")}</NavLink>}
            {me.role === "content_expert" && (
              <NavLink href="/admin/content">{t("nav.content")}</NavLink>
            )}
          </nav>
        }
      />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-6 sm:px-8 sm:py-10">
        <QueryProvider>{children}</QueryProvider>
      </main>
      <SiteFooter className="mx-auto w-full max-w-2xl px-5 pb-8 sm:px-8" />
    </>
  );
}
