import type { CandidateSessionQuestion, CandidateTurn } from "@readi/shared-types";
import { t } from "@/i18n";
import { contextBlocks } from "@/lib/question-context";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";

/**
 * The interview, as a transcript (ADR-0013, the M3 plan's "The interview screen").
 *
 * **No chat bubbles and no avatars.** The interviewer speaks in the serif — Alegreya 500, the
 * mentor's voice, at full measure — and the candidate's own words are the sans on a ruled left rail,
 * the treatment a quoted answer gets everywhere else in the product. That is the whole visual
 * grammar: whose voice it is, is the typeface, and there is nothing else to look at.
 *
 * A real `<ol>`, because it is an ordered record of what was said, and because a screen reader then
 * announces how many turns there are and which one it is on.
 */
export function Transcript({
  turns,
  questions,
}: {
  turns: readonly CandidateTurn[];
  /** Only the questions the session has reached; the API filters by `asked_at`. */
  questions: readonly CandidateSessionQuestion[];
}) {
  const byPosition = new Map(questions.map((question) => [question.position, question]));
  return (
    <ol aria-label={t("interview.screen.transcript")} className="flex flex-col gap-8">
      {turns.map((turn, index) => (
        <li
          key={turn.seq}
          /*
           * A new question starts a new section, marked by a hairline rule — the identity's own way
           * of dividing one thing from the next. Without it the intro, the first question and the
           * answer beneath it read as one long column, and "which of these am I answering" becomes
           * a question the candidate has to work out. A follow-up carries no rule: it belongs to
           * the question above it.
           */
          className={cn(
            "min-w-0",
            turn.state === "question" && index > 0 && "border-t border-border pt-8",
          )}
        >
          {turn.speaker === "interviewer" ? (
            <Interviewer
              turn={turn}
              /*
               * The setup material belongs under the turn that *asks* the question, not under a
               * follow-up about it: a snippet repeated beneath every probe would push the
               * conversation off a 360px screen. The `question` frame arrives before this turn, so
               * by the time the sentence pointing at the code is drawn, the code is in the map.
               */
              question={
                turn.state === "question" && turn.question_position !== null
                  ? byPosition.get(turn.question_position)
                  : undefined
              }
            />
          ) : (
            <Candidate turn={turn} />
          )}
        </li>
      ))}
    </ol>
  );
}

function Interviewer({
  turn,
  question,
}: {
  turn: CandidateTurn;
  question?: CandidateSessionQuestion;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="font-serif text-[1.3125rem] leading-[1.5] text-heading sm:text-[1.4375rem]">
        {/* Who is speaking is a typeface, which a screen reader cannot hear. */}
        <span className="sr-only">{t("interview.screen.interviewer")}: </span>
        {turn.text}
      </p>
      {question?.context && <QuestionSetup context={question.context} />}
    </div>
  );
}

function Candidate({ turn }: { turn: CandidateTurn }) {
  return (
    <div className="min-w-0 border-l-2 border-frame pl-4">
      <p className="text-base text-muted-foreground">{t("interview.screen.you")}</p>
      {/* Typed answers have paragraphs and lists in them; losing the line breaks loses the shape. */}
      <p className="mt-1 leading-relaxed whitespace-pre-wrap">{turn.text}</p>
    </div>
  );
}

/**
 * A question's setup material: a snippet, a scenario, a short table. Rendered from the pinned
 * question verbatim — it never passes through a model — and with no markdown renderer on this route
 * (ADR-0013 and the Slow 4G budget), so `question-context.ts` tells prose from a fenced block and
 * that is the whole of it.
 */
function QuestionSetup({ context }: { context: string }) {
  return (
    <figure className="flex min-w-0 flex-col gap-3 rounded-md border border-frame bg-muted p-4">
      <figcaption className="text-base text-muted-foreground">
        {t("interview.screen.setup")}
      </figcaption>
      {contextBlocks(context).map((block, index) =>
        block.kind === "code" ? (
          <CodeBlock key={index} text={block.text} />
        ) : (
          <p key={index} className="leading-relaxed whitespace-pre-wrap">
            {block.text}
          </p>
        ),
      )}
    </figure>
  );
}
