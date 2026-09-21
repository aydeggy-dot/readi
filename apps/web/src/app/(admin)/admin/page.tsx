import { ROLES } from "@readi/shared-types/constants";
import type { Metadata } from "next";
import { PageHeading } from "@/components/layout/page-heading";
import { TextLink } from "@/components/ui/text-link";
import { t } from "@/i18n";
import { requireAdmin, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.title") };

// Admin-only: everyone else gets a 404 (the API enforces the same rule with 403).
export default async function AdminPage() {
  await requireAdmin();
  const { data } = await (await serverApi()).GET("/api/admin/stats");
  if (!data) throw new Error("GET /api/admin/stats failed");

  return (
    <>
      <PageHeading title={t("admin.title")} lead={t("admin.description")} />
      <p className="text-lg">
        <TextLink href="/admin/content">{t("admin.content.title")}</TextLink>{" "}
        <span className="text-muted-foreground">{t("admin.content.description")}</span>
      </p>
      <section className="flex flex-col gap-2 border-t border-frame pt-6">
        {/* Figures are sans, always, whatever is around them (ADR-0013). */}
        <p className="text-5xl leading-none font-bold" data-testid="admin-users-total">
          {data.users_total}
        </p>
        <p className="text-base text-muted-foreground">{t("admin.usersTotal")}</p>
        <h2 className="mt-6 text-xl leading-tight">{t("admin.byRole")}</h2>
        <dl className="divide-y divide-border">
          {ROLES.map((role) => (
            <div key={role} className="flex justify-between py-2">
              <dt>{t(`admin.roles.${role}`)}</dt>
              <dd className="font-bold">{data.users_by_role[role] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
