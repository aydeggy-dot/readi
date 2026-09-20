import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { PublicHeader } from "@/components/layout/public-header";
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
    <>
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8 sm:px-8 sm:py-12">
        <PageHeading title={t("status.title")} lead={t("status.description")} />

        <ul className="divide-y divide-border border-t border-frame">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
              data-testid={`status-${row.id}`}
            >
              <span className="font-bold text-heading">{row.label}</span>
              <span
                className={cn(
                  "flex items-center gap-2 text-base",
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
    </>
  );
}
