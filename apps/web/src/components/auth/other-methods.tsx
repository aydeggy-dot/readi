import Link from "next/link";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { HOME_PATH } from "@/lib/navigation";
import { OrDivider } from "./auth-card";
import { GoogleButton } from "./google-button";

/** The sign-in methods other than the one on the current page. */
/** `/phone` or `/login`, keeping where to go after sign-in (omitted when it is the default). */
const withNext = (path: string, next: string) =>
  next === HOME_PATH ? path : `${path}?next=${encodeURIComponent(next)}`;

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
          <Link href={withNext("/phone", next)}>{t("auth.withPhone")}</Link>
        ) : (
          <Link href={withNext("/login", next)}>{t("auth.withEmail")}</Link>
        )}
      </Button>
    </div>
  );
}
