import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/margin";
import { Select } from "@/components/ui/select";
import { t } from "@/i18n";
import { type CalibrationQuery, isNarrowed, nextHref } from "@/lib/calibration-query";

/**
 * The calibration queue's filter bar and pager.
 *
 * Server components, and the same idiom as the content lists for the same reason: the filter bar is a
 * plain GET form and the pager is a link, so the screen filters and pages with no JavaScript at all.
 * It is not `ContentFilters` because these filters are `scope` and `flagged`, which that component has
 * no field for — copying the idiom is the house instruction where the shape does not fit.
 */
export function CalibrationFilters({ action, query }: { action: string; query: CalibrationQuery }) {
  return (
    <form
      method="get"
      action={action}
      className="flex flex-col gap-3 border-t border-frame pt-6 sm:flex-row sm:items-end sm:gap-4"
    >
      {/* No cursor field: changing a filter starts again from the first page. */}
      <label className="flex flex-col gap-1.5">
        <span className="font-bold text-heading">{t("admin.calibration.filters.scope")}</span>
        <Select name="scope" defaultValue={query.scope}>
          <option value="unreviewed">{t("admin.calibration.filters.scopeUnreviewed")}</option>
          <option value="mine">{t("admin.calibration.filters.scopeMine")}</option>
          <option value="all">{t("admin.calibration.filters.scopeAll")}</option>
        </Select>
      </label>
      <label className="flex items-center gap-2 text-base">
        <input
          type="checkbox"
          name="flagged"
          value="true"
          defaultChecked={query.flagged === "true"}
          className="size-5 accent-[var(--nav-accent)]"
        />
        <span>{t("admin.calibration.filters.flaggedOnly")}</span>
      </label>
      <Button type="submit" variant="outline" size="sm" className="self-start sm:self-auto">
        {t("admin.content.filters.apply")}
      </Button>
      {isNarrowed(query) && (
        <Button asChild variant="ghost" size="sm" className="self-start sm:self-auto">
          <Link href={action}>{t("admin.content.filters.clear")}</Link>
        </Button>
      )}
    </form>
  );
}

export function CalibrationPager({
  pathname,
  query,
  nextCursor,
}: {
  pathname: string;
  query: CalibrationQuery;
  nextCursor: string | null;
}) {
  if (!nextCursor) return null;
  return (
    <Button asChild variant="outline" className="self-start">
      <Link href={nextHref(pathname, query, nextCursor)}>{t("admin.content.list.more")}</Link>
    </Button>
  );
}

/**
 * Why the queue is empty, in the reviewer's words.
 *
 * The API distinguishes four reasons because they lead to four different actions, and a screen that
 * said only "nothing here" would send somebody to read the sampler's code. Two of them are not
 * problems at all: nobody has consented yet, and the owner's gate is still closed.
 */
export function CalibrationEmpty({
  reason,
  narrowed,
}: {
  reason: "nothing_to_review" | "no_consent" | "staff_answers_only" | null;
  narrowed: boolean;
}) {
  if (reason === null) return null;
  const copy =
    reason === "no_consent"
      ? t("admin.calibration.empty.noConsent")
      : reason === "staff_answers_only"
        ? t("admin.calibration.empty.staffOnly")
        : narrowed
          ? t("admin.calibration.empty.narrowed")
          : t("admin.calibration.empty.nothing");
  return (
    <Note as="aside" className="border-t border-frame pt-6">
      {copy}
    </Note>
  );
}
