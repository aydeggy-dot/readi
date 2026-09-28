import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SessionReport } from "@/components/interview/report/session-report";
import { t } from "@/i18n";
import { getReport } from "@/lib/interview-data";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: t("interview.report.title") };

/**
 * The report (spec §4.4), in the `(session)` group rather than `(app)`: it belongs to the interview it
 * is about, and the navigation is not what a candidate wants halfway through reading their score.
 *
 * **Everything is server-rendered and there is no client JavaScript on this route.** The report is a
 * page of text, a handful of bars and some links — on a mid-range Android phone on a metered
 * connection, which is who this is for, the honest thing is to ship it as HTML. The waiting is the
 * completion screen's job, and that is where this sends a candidate whose report is not ready:
 * `getReport` answers `null` for all three refusals, and `/complete` explains each of them.
 */
export default async function InterviewReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnboarded();
  const { id } = await params;
  const report = await getReport(id);
  // Not `notFound()`: a report that is still being assembled is the ordinary case a second after an
  // interview ends, and the completion screen is the screen that waits.
  if (!report) redirect(`/interview/${id}/complete`);
  return <SessionReport report={report} />;
}
