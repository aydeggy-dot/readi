import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { t } from "@/i18n";

/** Header for signed-in pages. `nav` is omitted during onboarding. */
export function AppHeader({ nav }: { nav?: ReactNode }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-5 py-3 sm:px-8">
        <Link href="/home" className="text-lg font-semibold tracking-tight">
          {t("app.name")}
        </Link>
        <div className="flex items-center gap-1">
          {nav}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent">
      {children}
    </Link>
  );
}
