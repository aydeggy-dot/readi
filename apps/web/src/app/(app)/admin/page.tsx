import { ROLES } from "@readi/shared-types/constants";
import type { Metadata } from "next";
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
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.title")}</h1>
        <p className="text-muted-foreground">{t("admin.description")}</p>
      </div>
      <section className="flex flex-col gap-3 rounded-lg border p-5">
        <p className="text-3xl font-bold" data-testid="admin-users-total">
          {data.users_total}
        </p>
        <p className="text-sm text-muted-foreground">{t("admin.usersTotal")}</p>
        <h2 className="mt-2 font-semibold">{t("admin.byRole")}</h2>
        <dl className="divide-y">
          {ROLES.map((role) => (
            <div key={role} className="flex justify-between py-2">
              <dt>{t(`admin.roles.${role}`)}</dt>
              <dd className="font-medium">{data.users_by_role[role] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
