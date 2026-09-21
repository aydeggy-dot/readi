import type { ContentStatus } from "@readi/shared-types";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Where a piece of content stands (ADR-0014 decision 1). Never colour alone: the word is the
 * signal, and the colour only reinforces it — published green, retired struck through in muted.
 */
export function StatusBadge({ status }: { status: ContentStatus }) {
  return (
    <span
      data-testid={`status-${status}`}
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-sm font-bold",
        status === "published" && "border-success/40 bg-success/5 text-success",
        status === "in_review" && "border-primary/40 bg-accent text-primary",
        status === "draft" && "border-border bg-muted text-muted-foreground",
        status === "retired" && "border-border bg-muted text-muted-foreground line-through",
      )}
    >
      {t(`admin.content.status.${status}`)}
    </span>
  );
}

/**
 * Whether `/content/seed` still owns this item's words (ADR-0014 decision 5). It is on the row and
 * on the editor, because it changes what saving means: the first save here ends the file's claim.
 */
export function SeedBadge({ seedManaged }: { seedManaged: boolean }) {
  if (!seedManaged) return null;
  return (
    <span
      data-testid="seed-managed"
      title={t("admin.content.seed.badgeHint")}
      className="inline-flex items-center rounded-sm border border-border bg-muted px-2 py-0.5 text-sm text-muted-foreground"
    >
      {t("admin.content.seed.badge")}
    </span>
  );
}
