import type {
  CandidateCriterionFeedback,
  CandidateQuestionReport,
  ReportHighlight,
  SessionReportResponse,
} from "@readi/shared-types";
import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Highlight, Margined, Note } from "@/components/ui/margin";
import { TextLink } from "@/components/ui/text-link";
import { formatDate, t } from "@/i18n";
import {
  bandKey,
  catalogueLine,
  promptedSentence,
  questionPromptingSentence,
  reportDate,
  scoredSentence,
  sessionPrompting,
  volunteeredSentence,
} from "@/lib/report-view";
import { ScoreMeter } from "./score-meter";

/**
 * The report a candidate reads after an interview (spec §4.4) — the most important screen in the
 * product after the interview itself.
 *
 * ## It is a reading column, and everything in it is checkable
 *
 * The Margin identity (ADR-0013) is a page of the candidate's own work with a mentor's notes beside
 * it, and a report is the first screen where that is literally what is on offer: the score, the words
 * it was based on, and the note explaining the gap between them. So the grammar of the transcript is
 * kept exactly — the interviewer's question is the serif at full measure, the candidate's own words
 * are the sans on a ruled rail — and each criterion's reasoning is a `Note`, paired with the quote it
 * is about by `Margined`, which puts it in the margin at `lg` and underneath on a phone.
 *
 * The quotes are `<mark>`s rather than italics because they are the mentor picking a phrase out of
 * something the candidate wrote, which is what `<mark>` means and what `Highlight` draws. They carry no
 * numbers, although ADR-0013 numbers the quotes on the landing page: numbering exists to tie a phrase
 * embedded in running prose to a note in a separate column, and here every quote already sits beside
 * the one note that explains it.
 *
 * ## What it may show, and what it may not
 *
 * This is the one candidate surface that carries part of the answer key, narrowly and only because the
 * session has already been scored (the owner's decisions 4 and 5, 2026-09-26): the question's pinned
 * ideal points as "what a strong answer covers", and each criterion's `dimension` as the vocabulary the
 * feedback is written in. It never sees a criterion's description, its weight, or any of the five level
 * descriptors — not because this file is careful but because `CandidateCriterionFeedback` does not have
 * them, and `content-no-answer-key.int.spec.ts` counts the ones that do cross.
 *
 * ## Three honest states, none of them hidden
 *
 * An answer the evaluator could not read says so, in its own words, and still shows what a strong
 * answer covers — which is the useful half of a lost score. A session where **nothing** could be scored
 * shows no number at all rather than a 0. And a role with no published study track says there is
 * nothing to link to yet, which is true of five of the eight role × level pairs.
 *
 * The copy is a draft for the owner, like the landing page's
 * (`docs/progress/2026-09-20-d1-landing-copy.md`).
 */
export function SessionReport({ report }: { report: SessionReportResponse }) {
  const prompting = sessionPrompting(report.questions);
  const volunteered = volunteeredSentence(prompting);
  const prompted = promptedSentence(prompting);
  const topicOf = new Map(
    report.questions.map((question) => [question.position, question.topic.name]),
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-5 py-6 sm:px-8 sm:py-10">
      <PageHeading
        title={t("interview.report.title")}
        lead={t("interview.report.lead", {
          catalogue: catalogueLine(report),
          date: formatDate(reportDate(report)),
        })}
      />

      <ScoreCard report={report} />

      {/*
        The most actionable sentence in the report, and the one the owner asked for in words rather
        than as a grid (decision 6, 2026-09-26): a table of which criteria needed a nudge would be an
        answer key with extra steps, and "you covered seven of eleven before being asked" is advice.
      */}
      {prompting.total > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl leading-tight">{t("interview.report.volunteeredTitle")}</h2>
          <Margined>
            <div className="flex flex-col gap-2">
              <p className="text-lg leading-relaxed">{t(volunteered.key, volunteered.vars)}</p>
              <p className="text-lg leading-relaxed">{t(prompted.key, prompted.vars)}</p>
            </div>
            <Note as="aside">{t("interview.report.volunteeredWhy")}</Note>
          </Margined>
        </section>
      )}

      <Highlights
        title={t("interview.report.strengthsTitle")}
        items={report.strengths}
        topicOf={topicOf}
      />
      <Highlights title={t("interview.report.fixesTitle")} items={report.fixes} topicOf={topicOf} />

      {report.by_topic.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl leading-tight">{t("interview.report.byTopicTitle")}</h2>
          <p className="text-base text-muted-foreground">{t("interview.report.weakestFirst")}</p>
          <ScoreRows
            rows={report.by_topic.map((row) => ({
              key: row.topic.slug,
              label: row.topic.name,
              overall: row.overall,
              answers: row.answers,
            }))}
          />
          {/* One answer is one answer. Said once, where the count that earns it is on screen. */}
          {report.by_topic.some((row) => row.answers === 1) && (
            <Note as="p">{t("interview.report.thinEvidence")}</Note>
          )}
        </section>
      )}

      {report.by_type.length > 1 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl leading-tight">{t("interview.report.byTypeTitle")}</h2>
          <ScoreRows
            rows={report.by_type.map((row) => ({
              key: row.type,
              label: t(`interview.types.${row.type}.label`),
              overall: row.overall,
              answers: row.answers,
            }))}
          />
        </section>
      )}

      <Lessons report={report} />

      <section className="flex flex-col gap-6">
        <h2 className="text-2xl leading-tight">{t("interview.report.questionsTitle")}</h2>
        {report.questions.map((question) => (
          <QuestionSection key={question.position} question={question} />
        ))}
      </section>

      <section className="flex flex-col gap-4 border-t border-frame pt-8">
        <h2 className="text-2xl leading-tight">{t("interview.report.transcriptTitle")}</h2>
        <p className="text-lg leading-relaxed">{t("interview.report.transcriptLead")}</p>
        <Button asChild variant="outline" className="self-start">
          <Link href={`/interview/${report.session_id}/complete`}>
            {t("interview.report.readTranscript")}
          </Link>
        </Button>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/practice/new">{t("interview.report.again")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
          <Link href="/practice">{t("interview.report.practice")}</Link>
        </Button>
      </div>

      {/* The same sentence the setup and completion screens make: which round this was, and which
          two it was not. A product that prepares one round out of three must not let a candidate
          walk away thinking it prepared three. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl leading-tight">{t("interview.report.scopeTitle")}</h2>
        <Note as="p">{t("interview.report.scope")}</Note>
      </section>
    </div>
  );
}

/**
 * The score, as a card.
 *
 * It is a card because it is the thing a candidate will screenshot and send to somebody (the owner's
 * decision 8, 2026-09-26: no public share URL at MVP, and a screenshot is the honest substitute), so
 * it has to make sense cropped to its own border — hence the catalogue line in the page heading above
 * it being repeated here as the count of answers, and hence **no quote from the transcript inside it**.
 *
 * The band is a word beside the number and never instead of it, and the note under it says what this
 * number is not: readiness needs more than one interview and is M6's, and a candidate who reads "71"
 * as "71% ready" has been misled by us rather than by the model.
 */
function ScoreCard({ report }: { report: SessionReportResponse }) {
  const scoredLine = scoredSentence(report);
  const scored = t(scoredLine.key, scoredLine.vars);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-frame bg-card p-5 sm:p-6">
      <h2 className="text-xl leading-tight">{t("interview.report.overallLabel")}</h2>
      {report.overall === null ? (
        // Nothing could be scored. A 0 would be a claim about the candidate; this is a claim about us.
        <p className="text-lg leading-relaxed">{scored}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-4">
            <span className="text-[3.25rem] leading-none font-bold tabular-nums text-heading">
              {report.overall}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-lg font-bold text-heading">{t(bandKey(report.overall))}</span>
              <span className="text-base text-muted-foreground">
                {t("interview.report.outOf")} · {scored}
              </span>
            </span>
          </div>
          <ScoreMeter value={report.overall} bands />
        </>
      )}
      <Note as="p">{t("interview.report.notReadiness")}</Note>
    </section>
  );
}

/**
 * The three strengths or the three fixes, each saying **which answer it is about**.
 *
 * They are `Note`s because they are the mentor's, and each one carries a link to the question it came
 * from, because a claim a candidate cannot trace is a verdict rather than feedback. The link goes to
 * that question's own section further down the page, where its quotes are.
 */
function Highlights({
  title,
  items,
  topicOf,
}: {
  title: string;
  items: readonly ReportHighlight[];
  topicOf: Map<number, string>;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl leading-tight">{title}</h2>
      {items.length === 0 ? (
        <p className="text-lg leading-relaxed">{t("interview.report.highlightsEmpty")}</p>
      ) : (
        <ol className="flex flex-col gap-5">
          {items.map((item) => (
            <li key={`${item.question_position}-${item.text}`} className="flex flex-col gap-1">
              <Note as="p">{item.text}</Note>
              <p className="pl-4 text-base">
                <TextLink href={`#question-${item.question_position}`}>
                  {t("interview.report.fromQuestion", {
                    position: item.question_position + 1,
                    topic: topicOf.get(item.question_position) ?? "",
                  })}
                </TextLink>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Scores by topic or by question type: label, number, bar, and how many answers are behind it. */
function ScoreRows({
  rows,
}: {
  rows: readonly { key: string; label: string; overall: number; answers: number }[];
}) {
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-lg text-heading">{row.label}</span>
            <span className="text-lg font-bold tabular-nums text-heading">{row.overall}</span>
          </div>
          <ScoreMeter value={row.overall} />
          <span className="text-base text-muted-foreground">
            {row.answers === 1
              ? t("interview.report.answersOne")
              : t("interview.report.answers", { count: row.answers })}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Lessons for the topics that went worst — and **two** honest states rather than one.
 *
 * Five of the eight role × level pairs have no published track, so most reports show the first: it says
 * what is missing and why, because a candidate told "study this" with nothing to study would be worse
 * than one told the lessons are not written yet.
 *
 * The second is that these are **not links**. There is no candidate-facing lesson page in the app yet
 * (the learning programme is a later milestone), and a title that looks like a link and answers 404 is
 * worse than a reading list that admits what it is. It is still worth showing: naming the lesson a
 * content expert wrote for the topic somebody went worst on is most of the value of the query, and the
 * day the page exists this becomes a list of links with no other change.
 */
function Lessons({ report }: { report: SessionReportResponse }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl leading-tight">{t("interview.report.lessonsTitle")}</h2>
      {report.lessons.length === 0 ? (
        <Note as="p">
          {t("interview.report.lessonsEmpty", {
            role: report.role.name,
            level: report.level.name,
          })}
        </Note>
      ) : (
        <>
          <p className="text-base text-muted-foreground">{t("interview.report.lessonsLead")}</p>
          <ul className="flex flex-col gap-3">
            {report.lessons.map((lesson) => (
              <li key={lesson.slug} className="flex flex-col gap-1">
                <span className="text-lg text-heading">{lesson.title}</span>
                <span className="text-base text-muted-foreground">{lesson.topic.name}</span>
              </li>
            ))}
          </ul>
          <Note as="p">{t("interview.report.lessonsNotReadable")}</Note>
        </>
      )}
    </section>
  );
}

/** One question: what was asked, how it scored, the words behind each criterion, and what was missed. */
function QuestionSection({ question }: { question: CandidateQuestionReport }) {
  const prompting = questionPromptingSentence(question.prompting);

  return (
    <article
      // The anchor the strengths and fixes link to. One-based, as the heading reads.
      id={`question-${question.position}`}
      className="flex scroll-mt-4 flex-col gap-5 border-t border-frame pt-6"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-xl leading-tight">
            {t("interview.report.questionHeading", { position: question.position + 1 })}
          </h3>
          {question.overall !== null && (
            <span className="text-xl font-bold tabular-nums text-heading">{question.overall}</span>
          )}
        </div>
        <p className="text-base text-muted-foreground">
          {t("interview.report.questionMeta", {
            type: t(`interview.types.${question.type}.label`),
            topic: question.topic.name,
          })}
        </p>
        {question.overall !== null && <ScoreMeter value={question.overall} />}
      </div>

      {/* The interviewer's voice, the same serif at the same measure the transcript sets it in. */}
      <div className="flex flex-col gap-1">
        <p className="text-base text-muted-foreground">{t("interview.report.askedLabel")}</p>
        <p className="font-serif text-[1.3125rem] leading-[1.5] text-heading">{question.prompt}</p>
      </div>

      <p className="text-lg leading-relaxed">{t(prompting.key, prompting.vars)}</p>

      {question.overall === null ? (
        <div className="flex flex-col gap-2 rounded-md border border-frame bg-muted p-4">
          <h4 className="font-serif text-lg leading-snug text-heading">
            {t("interview.report.unscoredTitle")}
          </h4>
          <p className="leading-relaxed">{t("interview.report.unscored")}</p>
        </div>
      ) : (
        question.criteria.length > 0 && (
          <section className="flex flex-col gap-6">
            <h4 className="font-serif text-lg leading-snug text-heading">
              {t("interview.report.criteriaTitle")}
            </h4>
            {question.criteria.map((criterion, index) => (
              <Criterion key={`${criterion.dimension}-${index}`} criterion={criterion} />
            ))}
          </section>
        )
      )}

      {question.covered_points.length > 0 && (
        <Points title={t("interview.report.coveredTitle")} points={question.covered_points} />
      )}
      {question.missing_points.length > 0 && (
        <Points title={t("interview.report.missingTitle")} points={question.missing_points} />
      )}

      {/*
        "What a strong answer covers" is the question's pinned `ideal_points` — answer key everywhere
        else in the product, and shown here because this session has already been scored. In its own
        frame, with the note that says so, because a candidate who does not know they are looking at
        the answer key cannot tell it from the mentor's opinion.
      */}
      {question.strong_answer_covers.length > 0 && (
        <div className="flex flex-col gap-3 rounded-md border border-frame bg-muted p-4">
          <h4 className="font-serif text-lg leading-snug text-heading">
            {t("interview.report.strongTitle")}
          </h4>
          <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-pen">
            {question.strong_answer_covers.map((point) => (
              <li key={point} className="leading-relaxed">
                {point}
              </li>
            ))}
          </ul>
          <Note as="p">{t("interview.report.strongNote")}</Note>
        </div>
      )}

      {question.improvement_tip && (
        <div className="flex flex-col gap-2">
          <h4 className="font-serif text-lg leading-snug text-heading">
            {t("interview.report.tipTitle")}
          </h4>
          <Note as="p">{question.improvement_tip}</Note>
        </div>
      )}

      {/*
        Not styled as an error. These are things the candidate stated as fact that the evaluator thinks
        are wrong, and the evaluator is not always right — so the frame invites a check, including a
        check of us, rather than announcing a fault.
      */}
      {question.red_flags.length > 0 && (
        <div className="flex flex-col gap-3 rounded-md border border-frame p-4">
          <h4 className="font-serif text-lg leading-snug text-heading">
            {t("interview.report.redFlagsTitle")}
          </h4>
          <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-pen">
            {question.red_flags.map((flag) => (
              <li key={flag} className="leading-relaxed">
                {flag}
              </li>
            ))}
          </ul>
          <Note as="p">{t("interview.report.redFlagsNote")}</Note>
        </div>
      )}
    </article>
  );
}

/**
 * One criterion: what was being judged, the score, the candidate's own words, and the note on them.
 *
 * `Margined` is the pairing: the quote and the note it answers are one row, side by side at `lg` and
 * stacked on a phone. Every non-zero score has at least one verified quote by the time it is stored —
 * the worker drops a quote it cannot find in the transcript and retries an unquoted non-zero score —
 * so the empty case here is the honest one: a score of nothing, with no sentence to point at.
 */
function Criterion({ criterion }: { criterion: CandidateCriterionFeedback }) {
  return (
    <Margined className="gap-y-3">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 font-serif text-lg leading-snug text-heading">
            {criterion.dimension}
          </p>
          <p className="text-base font-bold tabular-nums whitespace-nowrap text-heading">
            {t("interview.report.criterionScore", {
              score: criterion.score,
              max: criterion.max_score,
            })}
          </p>
        </div>
        {criterion.evidence.length === 0 ? (
          <p className="text-base text-muted-foreground">{t("interview.report.noEvidence")}</p>
        ) : (
          criterion.evidence.map((quote) => (
            <blockquote key={quote} className="border-l-2 border-frame pl-4">
              <p className="leading-relaxed">
                <Highlight>“{quote}”</Highlight>
              </p>
            </blockquote>
          ))
        )}
      </div>
      <Note as="p">{criterion.reasoning}</Note>
    </Margined>
  );
}

/** A short bullet list under its own small heading: what the answer covered, or what it missed. */
function Points({ title, points }: { title: string; points: readonly string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-serif text-lg leading-snug text-heading">{title}</h4>
      <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-pen">
        {points.map((point) => (
          <li key={point} className="leading-relaxed">
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}
