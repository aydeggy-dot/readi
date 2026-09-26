import type { Metadata } from "next";
import type { InterviewSummary } from "@readi/shared-types";
import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/margin";
import { formatDay, t } from "@/i18n";
import { activeInterview, listInterviews } from "@/lib/interview-data";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: t("interview.list.title") };

/** A keyset cursor, never an offset — the same rule the CMS lists follow. */
export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  await requireOnboarded();
  const { cursor } = await searchParams;
  const sessions = await listInterviews(cursor);
  const active = activeInterview(sessions.items);

  return (
    <>
      <PageHeading title={t("interview.list.title")} lead={t("interview.list.lead")} />

      {/*
        One live interview per candidate: starting a new one abandons what was running. So the way
        back into it comes first, and the button that would end it says what it would do.
      */}
      {active ? (
        <section className="flex flex-col gap-4 rounded-lg border border-frame bg-card p-5 sm:p-6">
          <h2 className="text-2xl leading-tight">{t("interview.list.activeTitle")}</h2>
          <p className="text-lg leading-relaxed">{t("interview.list.active")}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={`/interview/${active.id}`}>{t("interview.list.resume")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="/practice/new">{t("interview.list.start")}</Link>
            </Button>
          </div>
        </section>
      ) : (
        <Button asChild size="lg" className="w-full sm:w-auto sm:self-start">
          <Link href="/practice/new">
            {sessions.items.length === 0
              ? t("interview.list.startFirst")
              : t("interview.list.start")}
          </Link>
        </Button>
      )}

      {sessions.items.length === 0 ? (
        <p className="text-lg leading-relaxed">{t("interview.list.empty")}</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {sessions.items.map((session) => (
            <li key={session.id}>
              <SessionCard session={session} />
            </li>
          ))}
        </ol>
      )}

      {sessions.next_cursor && (
        <Button asChild variant="outline" className="self-start">
          <Link href={`/practice?cursor=${encodeURIComponent(sessions.next_cursor)}`}>
            {t("interview.list.more")}
          </Link>
        </Button>
      )}

      {/* Said on the list as well as at setup: what this prepares, and what it does not. */}
      <Note as="p" className="mt-2">
        {t("interview.list.scope")}
      </Note>
    </>
  );
}

function SessionCard({ session }: { session: InterviewSummary }) {
  const running = session.status === "in_progress";
  const meta = [
    session.stack?.name,
    t("interview.list.length", { minutes: session.planned_minutes }),
    session.is_diagnostic ? t("interview.list.diagnostic") : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-frame bg-card p-4 sm:p-5">
      <h2 className="text-xl leading-tight">
        {session.role.name} · {session.level.name}
      </h2>
      <p className="text-base text-muted-foreground">
        {/* The status leads the line rather than sitting in a chip of its own: at 360px a boxed
            word under the heading reads as a control somebody could press. */}
        <span className="mr-1 rounded-sm border border-frame px-1.5 py-0.5 font-bold text-heading">
          {t(`interview.list.status.${session.status}`)}
        </span>{" "}
        {meta.join(" · ")}
        {meta.length > 0 && " · "}
        {t("interview.list.asked", {
          asked: session.questions_asked,
          budget: session.question_budget,
        })}
        {" · "}
        {t("interview.list.started", { date: formatDay(session.started_at) })}
      </p>
      <Button asChild variant="outline" className="self-start">
        <Link href={running ? `/interview/${session.id}` : `/interview/${session.id}/complete`}>
          {running ? t("interview.list.resume") : t("interview.list.read")}
        </Link>
      </Button>
    </article>
  );
}
