import type { Metadata } from "next";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("offline.title") };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-3 px-5 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{t("offline.title")}</h1>
      <p className="text-muted-foreground">{t("offline.body")}</p>
    </main>
  );
}
