import { CALIBRATION_LIMITS, type CalibrationAgreementRow } from "@readi/shared-types";
import type { Metadata } from "next";
import { PageHeading } from "@/components/layout/page-heading";
import { Note } from "@/components/ui/margin";
import { t } from "@/i18n";
import { requireAdmin, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.calibration.agreement.title") };

/**
 * How closely the people and the model agree (M4 phase 6).
 *
 * `requireAdmin`, deliberately, where the queue is a content expert's: an aggregate a reviewer reads
 * before scoring is still the model's opinion reaching them first, and the whole value of a blind
 * review is that it did not. The figures are the same five the `/evals` harness prints, so a number
 * here and a number from a harness run can be read on one axis.
 *
 * **Rows, not a table.** The first version was a six-column table inside a horizontal scroller, and
 * at 360px the `Exact` column — the figure somebody came here for — sat off the right-hand edge. The
 * CMS layout's own note says "nothing here is a table"; this is why.
 */
export default async function CalibrationAgreementPage() {
  await requireAdmin();
  const api = await serverApi();
  const { data } = await api.GET("/api/admin/calibration/agreement", {});
  if (!data) throw new Error("GET /api/admin/calibration/agreement failed");

  return (
    <>
      <PageHeading
        title={t("admin.calibration.agreement.title")}
        lead={t("admin.calibration.agreement.lead")}
      />
      <Note as="aside">{t("admin.calibration.agreement.note")}</Note>

      <dl className="grid grid-cols-2 gap-4 border-t border-frame pt-6 sm:grid-cols-4">
        {[
          [t("admin.calibration.agreement.scoredAnswers"), String(data.scored_answers)],
          [t("admin.calibration.agreement.reviewers"), String(data.reviewers)],
          [t("admin.calibration.agreement.exact"), percent(data.overall.exact)],
          [t("admin.calibration.agreement.bias"), signed(data.overall.bias)],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-base text-muted-foreground">{label}</dt>
            <dd className="text-2xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <Section title={t("admin.calibration.agreement.byRubric")} rows={data.by_rubric} />
      <Section title={t("admin.calibration.agreement.byQuestion")} rows={data.by_question} />
    </>
  );
}

function Section({ title, rows }: { title: string; rows: CalibrationAgreementRow[] }) {
  return (
    <section className="flex flex-col gap-4 border-t border-frame pt-6">
      <h2 className="text-xl leading-tight">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-base text-muted-foreground">{t("admin.calibration.agreement.empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-frame">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-2 py-4 first:pt-0">
              <div className="flex flex-col gap-0.5">
                <span className="text-lg text-heading">{row.name}</span>
                <code className="text-base text-muted-foreground">{row.key}</code>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
                <Figure
                  label={t("admin.calibration.agreement.answers")}
                  value={String(row.answers)}
                />
                <Figure
                  label={t("admin.calibration.agreement.exact")}
                  value={percent(row.agreement.exact)}
                />
                <Figure
                  label={t("admin.calibration.agreement.withinOne")}
                  value={percent(row.agreement.within_one)}
                />
                <Figure
                  label={t("admin.calibration.agreement.mae")}
                  value={row.agreement.mae.toFixed(2)}
                />
                <Figure
                  label={t("admin.calibration.agreement.bias")}
                  value={signed(row.agreement.bias)}
                />
              </dl>
              {/* A percentage over four answers is an anecdote; the row says so rather than letting
                  a reader take it for a measurement. */}
              {row.answers < CALIBRATION_LIMITS.thinEvidenceAnswers && (
                <p className="text-base text-muted-foreground">
                  {t("admin.calibration.agreement.thin")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-base text-muted-foreground">{label}</dt>
      <dd className="text-lg tabular-nums">{value}</dd>
    </div>
  );
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
/** A bias of zero is "0.00", not "+0.00": the sign is the finding, and there isn't one. */
const signed = (value: number) =>
  value === 0 ? "0.00" : `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;
