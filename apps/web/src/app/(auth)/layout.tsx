import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@/i18n";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-8 px-5 py-8 sm:py-16">
      <Link href="/" className="self-start text-lg font-semibold tracking-tight">
        {t("app.name")}
      </Link>
      {children}
    </main>
  );
}
