import { t } from "@/i18n";

/** Shown while a page waits for the API — on a slow connection that wait is seconds, not frames. */
export default function Loading() {
  return (
    <div className="flex items-center gap-3 py-8 text-muted-foreground" role="status">
      <span
        aria-hidden
        className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      <span>{t("common.loading")}</span>
    </div>
  );
}
