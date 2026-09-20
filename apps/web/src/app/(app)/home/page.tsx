import type { Metadata } from "next";
import { PageHeading } from "@/components/layout/page-heading";
import { VerifyEmailBanner } from "@/components/auth/verify-email-banner";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: t("home.title") };

export default async function HomePage() {
  const me = await requireOnboarded();

  return (
    <>
      <PageHeading
        title={me.name ? t("home.greeting", { name: me.name }) : t("home.greetingNoName")}
      />
      {me.email && !me.email_verified && <VerifyEmailBanner email={me.email} />}
      <section className="flex flex-col gap-4 rounded-lg border border-frame bg-card p-5 sm:p-6">
        <h2 className="text-2xl leading-tight">{t("home.diagnostic.title")}</h2>
        <p className="text-lg leading-relaxed">{t("home.diagnostic.body")}</p>
        {/* The diagnostic interview is built in M3. */}
        <Button disabled size="lg" className="w-full sm:w-auto sm:self-start">
          {t("home.diagnostic.cta")}
        </Button>
        <p className="text-base text-muted-foreground">{t("home.diagnostic.note")}</p>
      </section>
    </>
  );
}
