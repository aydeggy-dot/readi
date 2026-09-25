import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { VerifyEmailBanner } from "@/components/auth/verify-email-banner";
import { StartDiagnosticButton } from "@/components/interview/start-diagnostic-button";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { activeInterview, listInterviews } from "@/lib/interview-data";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: t("home.title") };

export default async function HomePage() {
  const me = await requireOnboarded();
  const sessions = await listInterviews();
  const active = activeInterview(sessions.items);
  /*
   * Only the first page, deliberately: a candidate whose diagnostic is more than twenty sessions
   * old being offered another one is not a wrong answer, and paging the whole history to decide
   * which card to draw would be.
   */
  const taken = sessions.items.some((session) => session.is_diagnostic && !active);

  return (
    <>
      <PageHeading
        title={me.name ? t("home.greeting", { name: me.name }) : t("home.greetingNoName")}
      />
      {me.email && !me.email_verified && <VerifyEmailBanner email={me.email} />}

      <section className="flex flex-col gap-4 rounded-lg border border-frame bg-card p-5 sm:p-6">
        {active ? (
          <>
            {/* An interview in flight is the only thing worth offering: it ends if they start another. */}
            <h2 className="text-2xl leading-tight">{t("interview.list.activeTitle")}</h2>
            <p className="text-lg leading-relaxed">{t("interview.list.active")}</p>
            <Button asChild size="lg" className="w-full sm:w-auto sm:self-start">
              <Link href={`/interview/${active.id}`}>{t("interview.list.resume")}</Link>
            </Button>
          </>
        ) : taken ? (
          <>
            <h2 className="text-2xl leading-tight">{t("home.diagnostic.takenTitle")}</h2>
            <p className="text-lg leading-relaxed">{t("home.diagnostic.taken")}</p>
            <Button asChild size="lg" className="w-full sm:w-auto sm:self-start">
              <Link href="/practice">{t("home.diagnostic.practice")}</Link>
            </Button>
          </>
        ) : (
          <>
            <h2 className="text-2xl leading-tight">{t("home.diagnostic.title")}</h2>
            <p className="text-lg leading-relaxed">{t("home.diagnostic.body")}</p>
            <StartDiagnosticButton />
            <p className="text-base text-muted-foreground">{t("home.diagnostic.note")}</p>
          </>
        )}
      </section>
    </>
  );
}
