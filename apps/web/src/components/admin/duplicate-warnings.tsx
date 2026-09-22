import type { DuplicateMatch } from "@readi/shared-types";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/badges";
import { Alert } from "@/components/ui/alert";
import { t } from "@/i18n";

/**
 * Questions that read like this one (ADR-0006). A warning and never a refusal: publishing has
 * already happened, and whether two questions are really the same is a judgement nobody should
 * ask a cosine distance to make.
 */
export function DuplicateWarnings({ matches }: { matches: DuplicateMatch[] }) {
  if (matches.length === 0) return null;
  return (
    <Alert className="flex flex-col items-start gap-3">
      <div>
        <p className="font-bold text-heading">{t("admin.content.duplicates.title")}</p>
        <p className="text-base text-muted-foreground">{t("admin.content.duplicates.lead")}</p>
      </div>
      <ul data-testid="duplicate-warnings" className="flex w-full flex-col gap-3">
        {matches.map((match) => (
          <li key={match.question_id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href={`/admin/content/questions/${match.question_id}`}
                className="font-bold underline decoration-pen decoration-2 underline-offset-4"
              >
                {match.slug}
              </Link>
              <StatusBadge status={match.status} />
              <span className="text-base text-muted-foreground">
                {t("admin.content.duplicates.match", {
                  percent: Math.round(match.similarity * 100),
                })}
              </span>
            </div>
            <p className="line-clamp-2 text-base text-muted-foreground">{match.prompt}</p>
          </li>
        ))}
      </ul>
    </Alert>
  );
}
