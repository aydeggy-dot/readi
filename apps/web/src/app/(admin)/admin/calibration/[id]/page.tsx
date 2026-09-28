import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalibrationScoreForm } from "@/components/admin/calibration-form";
import { PageHeading } from "@/components/layout/page-heading";
import { Note } from "@/components/ui/margin";
import { TextLink } from "@/components/ui/text-link";
import { t } from "@/i18n";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.calibration.answer.title") };

/**
 * One answer, marked blind (M4 phase 6, ADR-0017).
 *
 * The payload carries the pinned rubric and the exchange and **not** the model's marks, so there is
 * nothing on this page to accidentally draw. Opening it writes an audit row on the API side: consent
 * was asked for a person reading a candidate's words, so the read is the event, not the score.
 */
export default async function CalibrationAnswerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireContentEditor();
  const { id } = await params;
  const api = await serverApi();
  const { data, response } = await api.GET("/api/admin/calibration/answers/{id}", {
    params: { path: { id } },
  });
  // 404 covers "no such answer", "consent withdrawn" and "that one is yours" — the API does not say
  // which, and neither does this page.
  if (!data) {
    if (response.status === 404) notFound();
    throw new Error("GET /api/admin/calibration/answers/{id} failed");
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <TextLink href="/admin/calibration">{t("admin.calibration.answer.back")}</TextLink>
        <PageHeading
          title={data.question_slug}
          lead={[data.role, data.level].filter(Boolean).join(" · ") || undefined}
        />
      </div>

      {data.evidence_flags.length > 0 && (
        <Note as="aside">
          {t("admin.calibration.answer.flagged", { phrases: data.evidence_flags.join("; ") })}
        </Note>
      )}

      <section className="flex flex-col gap-3 border-t border-frame pt-6">
        <h2 className="text-xl leading-tight">{t("admin.calibration.answer.question")}</h2>
        <p className="whitespace-pre-wrap text-lg">{data.question_prompt}</p>
        {data.question_context && (
          <pre className="overflow-x-auto rounded border border-frame bg-[var(--surface-muted,transparent)] p-3 text-base">
            <code>{data.question_context}</code>
          </pre>
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-frame pt-6">
        <h2 className="text-xl leading-tight">{t("admin.calibration.answer.exchange")}</h2>
        <ol className="flex flex-col gap-4">
          {data.exchange.map((turn) => (
            <li key={turn.seq} className="flex flex-col gap-1">
              <span className="text-base font-bold text-heading">
                {turn.speaker === "candidate"
                  ? t("admin.calibration.answer.candidate")
                  : turn.follow_up_index === null
                    ? t("admin.calibration.answer.interviewer")
                    : t("admin.calibration.answer.followUp")}
              </span>
              <p className="whitespace-pre-wrap text-lg">{turn.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <CalibrationScoreForm answer={data} />
    </>
  );
}
