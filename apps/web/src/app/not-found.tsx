import Link from "next/link";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** Also what admin-only pages show to everyone else, so it must not hint that they exist. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-4 px-5 py-8">
      <h1 className="text-[1.9rem] leading-tight sm:text-4xl">{t("errors.notFound.title")}</h1>
      <p className="text-lg text-muted-foreground">{t("errors.notFound.body")}</p>
      <Button asChild variant="outline" className="self-start">
        <Link href="/">{t("errors.home")}</Link>
      </Button>
    </main>
  );
}
