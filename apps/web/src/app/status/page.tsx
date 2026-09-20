import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { serverEnv } from "@/env/server";
import { t } from "@/i18n";
import { canViewStatus } from "@/lib/access";
import { fetchApiHealth } from "@/lib/api-health";
import { buildStatusRows } from "@/lib/status-rows";
import { getMe } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: t("status.title") };

// Always render on request: this page reports live health.
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  // Public in development; admins only in production (it reveals infrastructure health).
  if (
    serverEnv.APP_ENV === "production" &&
    !canViewStatus(serverEnv.APP_ENV, (await getMe())?.role)
  ) {
    notFound();
  }
  const rows = buildStatusRows(await fetchApiHealth(serverEnv.API_INTERNAL_URL));

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-5 py-8 sm:px-8 sm:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("status.title")}</h1>
        <p className="text-muted-foreground">{t("status.description")}</p>
      </div>

      <ul className="divide-y divide-border rounded-lg border">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-4 px-4 py-3"
            data-testid={`status-${row.id}`}
          >
            <span className="font-medium">{row.label}</span>
            <span
              className={cn(
                "flex items-center gap-2 text-sm",
                row.ok ? "text-success" : "text-destructive",
              )}
            >
              <span
                aria-hidden
                className={cn("size-2.5 rounded-full", row.ok ? "bg-success" : "bg-destructive")}
              />
              <span>{row.ok ? t("status.ok") : t("status.error")}</span>
              <span className="text-muted-foreground">· {row.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/status" prefetch={false}>
            {t("status.refresh")}
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">{t("status.back")}</Link>
        </Button>
      </div>
    </main>
  );
}
