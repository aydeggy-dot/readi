"use client";

import { INTERVIEW_LIMITS } from "@readi/shared-types/constants";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";

/**
 * What the candidate types, pinned to the bottom of the screen (ADR-0013).
 *
 * Two lines growing to four (`field-sizing-content` between a min and a max, so no JavaScript
 * measures anything), a 48px send button, and the two ways out of a question beside it. The draft
 * itself is owned by the screen, which keeps it in `sessionStorage`.
 *
 * **Ending the interview is two clicks, not a modal** — the pattern from `transition-panel.tsx`, for
 * the same reason: a modal at 360px costs more than it protects, and the second click is right here
 * beside the first.
 */
export function Composer({
  mode,
  busy,
  value,
  onChange,
  onSend,
  onSkip,
  onEnd,
}: {
  /** `ask` is the `candidate_questions` state, where the candidate is the one asking. */
  mode: "answer" | "ask";
  busy: boolean;
  value: string;
  onChange: (value: string) => void;
  /** Takes the trimmed text, so nothing depends on the order in which state settles. */
  onSend: (text: string) => void;
  onSkip: () => void;
  onEnd: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const empty = value.trim().length === 0;
  const label = mode === "ask" ? t("interview.screen.askLabel") : t("interview.screen.answerLabel");

  const send = () => {
    if (busy || empty) return;
    onSend(value.trim());
    onChange("");
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor="interview-answer" className="sr-only">
        {label}
      </label>
      <Textarea
        id="interview-answer"
        value={value}
        disabled={busy}
        // Two lines, growing to four and then scrolling; `resize-none` because it grows itself.
        className="field-sizing-content max-h-30 min-h-18 resize-none"
        placeholder={
          mode === "ask"
            ? t("interview.screen.askPlaceholder")
            : t("interview.screen.answerPlaceholder")
        }
        maxLength={INTERVIEW_LIMITS.answerMaxLength}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // A plain Enter is a paragraph break in an answer; ⌘/Ctrl+Enter sends, as everywhere else.
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            send();
          }
        }}
      />
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1" disabled={busy || empty}>
          {busy ? t("interview.screen.sending") : t("interview.screen.send")}
        </Button>
        <Button type="button" size="lg" variant="outline" disabled={busy} onClick={onSkip}>
          {mode === "ask" ? t("interview.screen.nothingToAsk") : t("interview.screen.skipQuestion")}
        </Button>
      </div>

      {confirming ? (
        <Alert className="flex flex-col items-start gap-3">
          <span>{t("interview.screen.endConfirm")}</span>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                onEnd();
              }}
            >
              {t("interview.screen.endNow")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </Alert>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          {t("interview.screen.endLabel")}
        </Button>
      )}
    </form>
  );
}
