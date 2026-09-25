import type { ReactNode } from "react";
import { QueryProvider } from "@/components/query-provider";
import { SiteFooter } from "@/components/layout/site-footer";
import { AppHeader } from "@/components/layout/app-header";
import { NavLink } from "@/components/layout/nav-link";
import { TabBar } from "@/components/layout/tab-bar";
import { t } from "@/i18n";
import { requireUser } from "@/lib/session";

/** The three places a candidate can be, in the order they meet them (M3: Practice is the third). */
const TABS = [
  { href: "/home", label: t("nav.home"), exact: true },
  { href: "/practice", label: t("nav.practice") },
  { href: "/profile", label: t("nav.profile") },
] as const;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await requireUser();
  return (
    <>
      <AppHeader
        nav={
          <nav aria-label={t("nav.main")} className="flex items-center gap-1 sm:gap-3">
            {/*
              On a phone the tab bar owns these two, so they are not also crowded into the header
              beside the wordmark and Log out. The staff links stay at every width: there are only
              three tabs, and a content expert on a phone still needs the way in.
            */}
            <span className="hidden items-center gap-1 sm:flex sm:gap-3">
              <NavLink href="/practice">{t("nav.practice")}</NavLink>
              <NavLink href="/profile">{t("nav.profile")}</NavLink>
            </span>
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
      {/* The footer is the last thing on the page, so the tab bar's clearance belongs on it. */}
      <SiteFooter className="mx-auto w-full max-w-2xl px-5 pb-24 sm:px-8 sm:pb-8" />
      <TabBar label={t("nav.tabs")} items={TABS} />
    </>
  );
}
