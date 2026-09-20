import Link from "next/link";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

const features = [
  "landing.features.interviewer",
  "landing.features.feedback",
  "landing.features.local",
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-between gap-10 px-5 py-8 sm:px-8 sm:py-16">
      <header>
        <p className="text-lg font-semibold tracking-tight">{t("app.name")}</p>
      </header>

      <section className="flex flex-col gap-6">
        <h1 className="text-3xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
          {t("landing.heading")}
        </h1>
        <p className="text-lg text-muted-foreground">{t("app.tagline")}</p>
        <ul className="flex flex-col gap-3">
          {features.map((key) => (
            <li key={key} className="flex gap-3 text-base">
              <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild className="w-full sm:w-auto">
            <Link href="/signup">{t("landing.getStarted")}</Link>
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/login">{t("landing.logIn")}</Link>
          </Button>
        </div>
      </section>

      <footer className="text-sm text-muted-foreground">
        <Link href="/status" className="underline underline-offset-4 hover:text-foreground">
          {t("landing.statusLink")}
        </Link>
      </footer>
    </main>
  );
}
