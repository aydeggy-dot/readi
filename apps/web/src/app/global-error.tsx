"use client";

import { t } from "@/i18n";

/** Last resort: an error in the root layout itself, where no shared UI is available. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en-NG">
      <body className="bg-background text-foreground antialiased">
        <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 px-5 py-8">
          <h1 className="text-2xl font-bold tracking-tight">{t("errors.title")}</h1>
          <p className="text-muted-foreground">{t("errors.body")}</p>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground"
          >
            {t("common.tryAgain")}
          </button>
        </main>
      </body>
    </html>
  );
}
