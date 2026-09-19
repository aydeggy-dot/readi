import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { OtherMethods } from "@/components/auth/other-methods";
import { PhoneForm } from "@/components/auth/phone-form";
import { t } from "@/i18n";
import { getAuthMethods } from "@/lib/auth-methods";
import { HOME_PATH } from "@/lib/navigation";
import { getMe } from "@/lib/session";

export const metadata: Metadata = { title: t("auth.phone.title") };

export default async function PhonePage() {
  if (await getMe()) redirect(HOME_PATH);
  const methods = await getAuthMethods();

  return (
    <AuthCard title={t("auth.phone.title")} subtitle={t("auth.phone.subtitle")}>
      <PhoneForm />
      <OtherMethods current="phone" google={methods.google} next={HOME_PATH} />
    </AuthCard>
  );
}
