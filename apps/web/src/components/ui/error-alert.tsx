"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { ApiFailure } from "@/lib/api-errors";

/** A failed API call. When the session ended, the way out is offered rather than described. */
export function ErrorAlert({ failure }: { failure: ApiFailure }) {
  const pathname = usePathname();
  return (
    <Alert variant="error" className="flex flex-col items-start gap-3">
      <span>{failure.message}</span>
      {failure.signedOut && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/login?next=${encodeURIComponent(pathname)}`}>
            {t("common.signInAgain")}
          </Link>
        </Button>
      )}
    </Alert>
  );
}
