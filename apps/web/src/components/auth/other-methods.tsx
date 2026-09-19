import Link from "next/link";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { OrDivider } from "./auth-card";
import { GoogleButton } from "./google-button";

/** The sign-in methods other than the one on the current page. */
export function OtherMethods({
  current,
  google,
  next,
}: {
  current: "email" | "phone";
  google: boolean;
  next: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <OrDivider label={t("common.or")} />
      {google && <GoogleButton next={next} />}
      <Button asChild variant="outline">
        {current === "email" ? (
          <Link href="/phone">{t("auth.withPhone")}</Link>
        ) : (
          <Link href="/login">{t("auth.withEmail")}</Link>
        )}
      </Button>
    </div>
  );
}
