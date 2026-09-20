import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { OtherMethods } from "@/components/auth/other-methods";
import { PhoneForm } from "@/components/auth/phone-form";
import { t } from "@/i18n";
import { getAuthMethods } from "@/lib/auth-methods";
import { safeNextPath } from "@/lib/navigation";
import { getMe } from "@/lib/session";

export const metadata: Metadata = { title: t("auth.phone.title") };

export default async function PhonePage({ searchParams }: PageProps<"/phone">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  if (await getMe()) redirect(next);
  const methods = await getAuthMethods();

  return (
    <AuthCard title={t("auth.phone.title")} subtitle={t("auth.phone.subtitle")}>
      <PhoneForm next={next} />
      <OtherMethods current="phone" google={methods.google} next={next} />
    </AuthCard>
  );
}
