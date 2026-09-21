import type { ContentStatus } from "@readi/shared-types";
import { SeedBadge, StatusBadge } from "@/components/admin/badges";
import { PageHeading } from "@/components/layout/page-heading";
import { Note } from "@/components/ui/margin";
import { TextLink } from "@/components/ui/text-link";
import { t } from "@/i18n";

/**
 * The top of every editor: what this is, where it stands, and — when `/content/seed` still owns
 * it — what saving here will mean (ADR-0014 decision 5). That last note is the one thing an
 * editor could not work out for themselves, so it is said in full rather than hinted at.
 */
export function EditorHeading({
  title,
  lead,
  backHref,
  status,
  seedManaged,
}: {
  title: string;
  lead?: string;
  backHref: string;
  status?: ContentStatus;
  seedManaged?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <TextLink href={backHref} className="text-base">
        {t("admin.content.actions.back")}
      </TextLink>
      <PageHeading title={title} lead={lead} />
      {(status || seedManaged !== undefined) && (
        <div className="flex flex-wrap items-center gap-3">
          {status && <StatusBadge status={status} />}
          <SeedBadge seedManaged={seedManaged ?? false} />
        </div>
      )}
      {seedManaged && <Note as="aside">{t("admin.content.seed.badgeHint")}</Note>}
    </div>
  );
}
