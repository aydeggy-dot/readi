import type { Metadata } from "next";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("offline.title") };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-3 px-5 py-8">
      <h1 className="text-[1.9rem] leading-tight sm:text-4xl">{t("offline.title")}</h1>
      <p className="text-lg text-muted-foreground">{t("offline.body")}</p>
    </main>
  );
}
