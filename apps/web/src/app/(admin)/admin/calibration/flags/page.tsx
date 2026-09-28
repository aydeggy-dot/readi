import type { Metadata } from "next";
import { CalibrationPager } from "@/components/admin/calibration-list";
import { PageHeading } from "@/components/layout/page-heading";
import { Note } from "@/components/ui/margin";
import { TextLink } from "@/components/ui/text-link";
import { formatDay, t } from "@/i18n";
import { calibrationQuery } from "@/lib/calibration-query";
import type { SearchParams } from "@/lib/content-query";
import { requireContentEditor, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: t("admin.calibration.flags.title") };

const PATH = "/admin/calibration/flags";

/**
 * Answers whose stored evidence reads like an instruction — the list M4 phase 3 said this area would
 * draw (owner's decision, 2026-09-27).
 *
 * It changes no score and reaches no candidate. The injection gate stops a model *inventing* a quote
 * and cannot stop one quoting the injection itself, because that quote is real — so this is a queue
 * for a person to look at, and the phrases in it are **ours**, never the candidate's words.
 */
export default async function CalibrationFlagsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireContentEditor();
  const query = calibrationQuery(await searchParams);
  const api = await serverApi();
  const { data } = await api.GET("/api/admin/calibration/flags", {
    params: { query: { cursor: query.cursor } },
  });
  if (!data) throw new Error("GET /api/admin/calibration/flags failed");

  return (
    <>
      <PageHeading
        title={t("admin.calibration.flags.title")}
        lead={t("admin.calibration.flags.lead")}
      />
      <Note as="aside">{t("admin.calibration.flags.note")}</Note>

      {data.phrases.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-frame pt-6">
          <h2 className="text-xl leading-tight">{t("admin.calibration.flags.phrases")}</h2>
          <ul className="flex flex-wrap gap-2">
            {data.phrases.map((row) => (
              <li
                key={row.phrase}
                className="rounded border border-frame px-2.5 py-1 text-base text-muted-foreground"
              >
                <code>{row.phrase}</code>{" "}
                <span>{t("admin.calibration.flags.count", { count: row.answers })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.items.length === 0 ? (
        <Note as="aside" className="border-t border-frame pt-6">
          {t("admin.calibration.flags.empty")}
        </Note>
      ) : (
        <ul className="flex flex-col divide-y divide-frame border-t border-frame">
          {data.items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1.5 py-4">
              <TextLink href={`/admin/calibration/${item.id}`} className="text-lg font-bold">
                {item.question_slug}
              </TextLink>
              <p className="flex flex-wrap gap-2">
                {item.flags.map((flag) => (
                  <code key={flag} className="text-base text-muted-foreground">
                    {flag}
                  </code>
                ))}
              </p>
              <p className="text-base text-muted-foreground">
                {t("admin.calibration.list.answered", { when: formatDay(item.answered_at) })}
              </p>
            </li>
          ))}
        </ul>
      )}

      <CalibrationPager pathname={PATH} query={query} nextCursor={data.next_cursor} />
    </>
  );
}
