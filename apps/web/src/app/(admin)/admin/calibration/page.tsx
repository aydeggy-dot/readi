import type { Metadata } from "next";
import Link from "next/link";
import {
  CalibrationEmpty,
  CalibrationFilters,
  CalibrationPager,
} from "@/components/admin/calibration-list";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/margin";
import { TextLink } from "@/components/ui/text-link";
import { formatDay, t } from "@/i18n";
import { calibrationQuery, isNarrowed } from "@/lib/calibration-query";
import type { SearchParams } from "@/lib/content-query";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.calibration.title") };

const PATH = "/admin/calibration";

/**
 * The review queue (M4 phase 6, ADR-0017).
 *
 * `requireContentEditor`, because reviewing is a content expert's work. What a reviewer may see is
 * decided in the API — a current `transcript_review` grant, not their own answer, and staff answers
 * only until the reviewer agreement is signed — so this page draws what it is given and makes no
 * decision of its own about whose words they are.
 */
export default async function CalibrationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireContentEditor();
  const query = calibrationQuery(await searchParams);
  const api = await serverApi();
  const { data } = await api.GET("/api/admin/calibration/queue", { params: { query } });
  if (!data) throw new Error("GET /api/admin/calibration/queue failed");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading title={t("admin.calibration.title")} lead={t("admin.calibration.lead")} />
        <Button asChild variant="outline">
          <Link href={`${PATH}/flags`}>{t("admin.calibration.actions.flags")}</Link>
        </Button>
      </div>

      <Note as="aside">{t("admin.calibration.blindNote")}</Note>

      <CalibrationFilters action={PATH} query={query} />

      {data.items.length > 0 && (
        <ul className="flex flex-col divide-y divide-frame border-t border-frame">
          {data.items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1.5 py-4">
              <TextLink href={`${PATH}/${item.id}`} className="text-lg font-bold">
                {item.question_slug}
              </TextLink>
              <p className="text-base text-muted-foreground">{item.rubric_name}</p>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-base text-muted-foreground">
                <span>
                  {[item.role, item.level].filter(Boolean).join(" · ") ||
                    t("admin.calibration.list.noCatalogue")}
                </span>
                <span>{t("admin.calibration.list.criteria", { count: item.criterion_count })}</span>
                <span>{t("admin.calibration.list.reviews", { count: item.review_count })}</span>
                {item.reviewed_by_me && <span>{t("admin.calibration.list.yours")}</span>}
                {item.flagged && (
                  <span className="font-bold text-heading">
                    {t("admin.calibration.list.flagged")}
                  </span>
                )}
                <span>
                  {t("admin.calibration.list.answered", { when: formatDay(item.answered_at) })}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}

      <CalibrationEmpty reason={data.empty_because} narrowed={isNarrowed(query)} />
      <CalibrationPager pathname={PATH} query={query} nextCursor={data.next_cursor} />
    </>
  );
}
