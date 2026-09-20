import type { Metadata } from "next";
import { VerifyEmailBanner } from "@/components/auth/verify-email-banner";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: t("home.title") };

export default async function HomePage() {
  const me = await requireOnboarded();

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">
        {me.name ? t("home.greeting", { name: me.name }) : t("home.greetingNoName")}
      </h1>
      {me.email && !me.email_verified && <VerifyEmailBanner email={me.email} />}
      <section className="flex flex-col gap-4 rounded-lg border p-5">
        <h2 className="text-lg font-semibold">{t("home.diagnostic.title")}</h2>
        <p className="text-muted-foreground">{t("home.diagnostic.body")}</p>
        {/* The diagnostic interview is built in M3. */}
        <Button disabled className="w-full sm:w-auto sm:self-start">
          {t("home.diagnostic.cta")}
        </Button>
        <p className="text-sm text-muted-foreground">{t("home.diagnostic.note")}</p>
      </section>
    </>
  );
}
