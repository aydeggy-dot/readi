import type { ReactNode } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Readi is its own identity; the DegRon relationship is a line of text in the footer, not a
 * second logo (ADR-0013). `children` holds whatever links the page already carries.
 */
export function SiteFooter({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <footer
      className={cn(
        "mt-10 flex flex-col gap-3 border-t border-frame pt-6 text-base text-muted-foreground sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p>{t("app.byline")}</p>
      {children}
    </footer>
  );
}
