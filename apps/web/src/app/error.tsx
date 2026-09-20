"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/**
 * Any server or client error inside the app shell. Without this the App Router shows its own
 * untranslated screen, which tells a candidate nothing and offers no way out.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 px-5 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{t("errors.title")}</h1>
      <p className="text-muted-foreground">{t("errors.body")}</p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={reset}>
          {t("common.tryAgain")}
        </Button>
        <Button asChild variant="outline">
          <Link href="/">{t("errors.home")}</Link>
        </Button>
      </div>
    </main>
  );
}
