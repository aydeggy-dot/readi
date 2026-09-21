import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/badges";
import { PageHeading } from "@/components/layout/page-heading";
import { Note } from "@/components/ui/margin";
import { formatDay, t } from "@/i18n";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.content.title") };

const SECTIONS = [
  { key: "questions", href: "/admin/content/questions" },
  { key: "rubrics", href: "/admin/content/rubrics" },
  { key: "lessons", href: "/admin/content/lessons" },
  { key: "tracks", href: "/admin/content/tracks" },
  { key: "topics", href: "/admin/content/topics" },
] as const;

interface QueueItem {
  href: string;
  title: string;
  kind: string;
  updatedAt: string;
}

/**
 * The CMS's front door: what is waiting for an admin, and the way in to each kind of content.
 *
 * The queue is the useful half. Everything in `in_review` has been written and submitted and is
 * doing nothing until someone looks at it, which is exactly the state that goes unnoticed.
 */
export default async function ContentHomePage() {
  await requireContentEditor();
  const api = await serverApi();
  const query = { status: "in_review" as const, limit: 5 };
  const [questions, rubrics, lessons, tracks] = await Promise.all([
    api.GET("/api/admin/content/questions", { params: { query } }),
    api.GET("/api/admin/content/rubrics", { params: { query } }),
    api.GET("/api/admin/content/lessons", { params: { query } }),
    api.GET("/api/admin/content/tracks", { params: { query } }),
  ]);

  const waiting: QueueItem[] = [
    ...(questions.data?.items ?? []).map((item) => ({
      href: `/admin/content/questions/${item.id}`,
      title: item.slug,
      kind: t("admin.content.sections.questions"),
      updatedAt: item.updated_at,
    })),
    ...(rubrics.data?.items ?? []).map((item) => ({
      href: `/admin/content/rubrics/${item.id}`,
      title: item.name,
      kind: t("admin.content.sections.rubrics"),
      updatedAt: item.updated_at,
    })),
    ...(lessons.data?.items ?? []).map((item) => ({
      href: `/admin/content/lessons/${item.id}`,
      title: item.title,
      kind: t("admin.content.sections.lessons"),
      updatedAt: item.updated_at,
    })),
    ...(tracks.data?.items ?? []).map((item) => ({
      href: `/admin/content/tracks/${item.id}`,
      title: item.title,
      kind: t("admin.content.sections.tracks"),
      updatedAt: item.updated_at,
    })),
  ].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  return (
    <>
      <PageHeading title={t("admin.content.title")} lead={t("admin.content.description")} />
      <Note as="aside">{t("admin.content.workflow")}</Note>

      <section className="flex flex-col gap-3 border-t border-frame pt-6">
        <h2 className="text-xl leading-tight">{t("admin.content.queue.title")}</h2>
        {waiting.length === 0 ? (
          <p className="text-base text-muted-foreground">{t("admin.content.queue.empty")}</p>
        ) : (
          <>
            <p className="text-base text-muted-foreground">{t("admin.content.queue.lead")}</p>
            <ul className="divide-y divide-border">
              {waiting.map((item) => (
                <li key={item.href} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                  <Link
                    href={item.href}
                    className="font-bold underline decoration-pen decoration-2 underline-offset-4"
                  >
                    {item.title}
                  </Link>
                  <span className="text-base text-muted-foreground">{item.kind}</span>
                  <StatusBadge status="in_review" />
                  <span className="text-base text-muted-foreground">
                    {t("admin.content.list.updated", { when: formatDay(item.updatedAt) })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="grid gap-4 border-t border-frame pt-6 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.key}
            href={section.href}
            className="flex flex-col gap-1 rounded-md border border-input p-4 transition-colors hover:bg-accent"
          >
            <span className="text-xl leading-tight font-bold text-heading">
              {t(`admin.content.sections.${section.key}`)}
            </span>
            <span className="text-base text-muted-foreground">
              {t(`admin.content.sections.${section.key}Lead`)}
            </span>
          </Link>
        ))}
      </section>
    </>
  );
}
