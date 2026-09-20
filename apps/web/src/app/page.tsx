import Link from "next/link";
import { PublicHeader } from "@/components/layout/public-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { Highlight, Margined, Note } from "@/components/ui/margin";
import { t } from "@/i18n";

/**
 * The landing page, in the Margin direction (ADR-0013): the product explains itself by doing its
 * job — an answer someone gave, the phrases the mentor picked out, and the notes on them.
 *
 * ⚠ The copy here is a DRAFT for the owner to edit; see docs/progress/2026-09-20-d1-landing-copy.md
 * for the whole text in one place, the facts each claim rests on, and the sentences that describe
 * features we have specified but not yet built.
 */
export default function LandingPage() {
  return (
    <>
      <PublicHeader
        actions={
          <>
            <Button asChild variant="nav" size="sm">
              <Link href="/login">{t("landing.logIn")}</Link>
            </Button>
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/signup">{t("landing.getStarted")}</Link>
            </Button>
          </>
        }
      />

      <main>
        {/* One column on a phone, in this order: the headline, the example, then the way in.
            At lg the example moves alongside and spans both rows, so nothing has to stretch. */}
        <section className="mx-auto grid max-w-5xl gap-10 px-5 pt-8 pb-14 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:grid-rows-[auto_auto] lg:items-start lg:gap-x-14 lg:gap-y-8 lg:pt-14 lg:pb-20">
          <div className="flex flex-col gap-6">
            <h1 className="text-[2.1rem] leading-[1.1] text-balance sm:text-5xl">
              {t("landing.heading")}
            </h1>
            <p className="max-w-[33rem] text-lg leading-relaxed sm:text-xl">{t("landing.lead")}</p>
            {/* Said before the buttons, not after: most of what this page describes is still being
                built, and nobody should sign up without knowing that (owner, 2026-09-20). */}
            <Note as="p" className="max-w-[33rem]">
              {t("landing.inTheOpen")}
            </Note>
          </div>

          {/* The demonstration. It has to make sense on its own, before any heading does. */}
          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <AnnotatedAnswer />
          </div>

          <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-2">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/signup">{t("landing.getStarted")}</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/login">{t("landing.logIn")}</Link>
              </Button>
            </div>
            <p className="text-base text-muted-foreground">{t("landing.freeNote")}</p>
          </div>
        </section>

        <section className="border-t border-frame">
          <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 lg:py-20">
            <Margined>
              <div className="flex flex-col gap-5">
                <h2 className="text-2xl leading-tight sm:text-4xl">
                  {t("landing.problem.heading")}
                </h2>
                <p className="text-lg leading-relaxed sm:text-xl">{t("landing.problem.p1")}</p>
                <p className="text-lg leading-relaxed sm:text-xl">{t("landing.problem.p2")}</p>
                <p className="text-lg leading-relaxed sm:text-xl">{t("landing.problem.p3")}</p>
              </div>
              <Note as="aside" className="lg:self-end lg:pb-2">
                {t("landing.problem.note")}
              </Note>
            </Margined>
          </div>
        </section>

        <section className="bg-muted">
          <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 lg:py-20">
            <h2 className="text-2xl leading-tight sm:text-4xl">{t("landing.session.heading")}</h2>
            <ol className="mt-8 grid gap-8 lg:grid-cols-3 lg:gap-10">
              <Step
                n={1}
                title={t("landing.session.step1Title")}
                body={t("landing.session.step1Body")}
              />
              <Step
                n={2}
                title={t("landing.session.step2Title")}
                body={t("landing.session.step2Body")}
              />
              <Step
                n={3}
                title={t("landing.session.step3Title")}
                body={t("landing.session.step3Body")}
              />
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-14 sm:px-8 lg:py-20">
          <Margined>
            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-4">
                <h2 className="text-2xl leading-tight sm:text-3xl">
                  {t("landing.audience.heading")}
                </h2>
                <p className="text-lg leading-relaxed sm:text-xl">{t("landing.audience.body")}</p>
              </div>
              <div className="flex flex-col gap-4">
                <h2 className="text-2xl leading-tight sm:text-3xl">{t("landing.cost.heading")}</h2>
                <p className="text-lg leading-relaxed sm:text-xl">{t("landing.cost.body")}</p>
              </div>
            </div>
            <Note as="aside" className="lg:self-center">
              {t("landing.cost.note")}
            </Note>
          </Margined>
        </section>

        <section className="border-t border-frame">
          <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-5 py-14 sm:px-8 lg:py-20">
            <h2 className="max-w-3xl text-[1.9rem] leading-[1.1] sm:text-5xl">
              {t("landing.closing.heading")}
            </h2>
            <p className="max-w-xl text-lg leading-relaxed sm:text-xl">
              {t("landing.closing.body")}
            </p>
            <Button asChild size="lg" className="mt-4 w-full sm:w-auto">
              <Link href="/signup">{t("landing.closing.cta")}</Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter className="mx-auto w-full max-w-5xl px-5 pb-8 sm:px-8">
        <Link href="/status" className="underline underline-offset-4 hover:text-foreground">
          {t("landing.statusLink")}
        </Link>
      </SiteFooter>
    </>
  );
}

/**
 * One answer, marked up the way a session report marks it up: the phrases the mentor picked out,
 * numbered, and the note that answers each one. `data-sweep` is what the highlighter animation in
 * globals.css keys off; under reduced motion the highlights are simply there.
 */
function AnnotatedAnswer() {
  return (
    <figure
      className="rounded-lg border border-frame bg-card p-5 sm:p-7"
      aria-labelledby="example-caption"
    >
      <figcaption id="example-caption" className="text-base text-muted-foreground">
        {t("landing.example.caption")}
      </figcaption>
      <p className="mt-4 font-bold text-heading">{t("landing.example.question")}</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_11rem] sm:gap-6">
        <p data-sweep className="text-lg leading-[1.7]">
          {t("landing.example.answerBefore")}
          <Highlight mark={1}>{t("landing.example.answerQuote1")}</Highlight>
          {t("landing.example.answerBetween")}
          <Highlight mark={2}>{t("landing.example.answerQuote2")}</Highlight>
          {t("landing.example.answerAfter")}
        </p>
        <ol aria-label={t("landing.example.notesLabel")} className="grid content-start gap-4">
          <Note as="li" mark={1}>
            {t("landing.example.note1")}
          </Note>
          <Note as="li" mark={2}>
            {t("landing.example.note2")}
          </Note>
        </ol>
      </div>
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-frame pt-4">
        <p className="font-bold text-heading">{t("landing.example.score")}</p>
        <p className="text-base text-muted-foreground">{t("landing.example.evidence")}</p>
      </div>
    </figure>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="grid grid-cols-[2.25rem_1fr] gap-x-2">
      <span className="text-4xl leading-none font-bold text-primary">{n}</span>
      <div>
        <h3 className="text-xl sm:text-2xl">{title}</h3>
        <p className="mt-2 text-lg leading-relaxed">{body}</p>
      </div>
    </li>
  );
}
