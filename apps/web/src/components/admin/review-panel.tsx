"use client";

import type { ContentEntityPath } from "@readi/shared-types";
import { CONTENT_LIMITS } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/margin";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import { contentErrorMessage } from "@/lib/content-errors";

/**
 * Recording that a person has read a model's draft and stands behind it (ADR-0014 decision 6).
 *
 * Deliberately not part of saving an edit: a draft that needs no changes would otherwise have to
 * be edited to be approved, and a one-word typo fix would count as reviewing the whole question
 * and its rubric. It is drawn only while there is something to review, so the panel disappearing
 * is itself the confirmation.
 */
export function ReviewPanel({
  entity,
  id,
  aiDraftUnreviewed,
  reviewedAt,
}: {
  entity: ContentEntityPath;
  id: string;
  aiDraftUnreviewed: boolean;
  reviewedAt: string | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<ApiFailure>();

  if (!aiDraftUnreviewed) {
    // Nothing to do, but when a review happened the editor should be able to see that it did.
    return reviewedAt ? (
      <Note as="aside">
        {t("admin.content.review.reviewedOn", {
          date: new Date(reviewedAt).toLocaleDateString(),
        })}
      </Note>
    ) : null;
  }

  const run = async () => {
    setPending(true);
    setConfirming(false);
    setFailure(undefined);
    try {
      const { data, error, response } = await browserApi.POST(
        "/api/admin/content/{entity}/{id}/reviewed",
        { params: { path: { entity, id } }, body: { note: note.trim() || null } },
      );
      if (!data) {
        const message = contentErrorMessage(error);
        setFailure(message ? { message, signedOut: false } : apiFailure(response.status));
        return;
      }
      setDone(true);
      setNote("");
      router.refresh();
    } catch {
      setFailure(networkFailure());
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 border-t border-frame pt-6">
      <h2 className="text-xl leading-tight">{t("admin.content.review.legend")}</h2>
      <p className="text-base text-muted-foreground">{t("admin.content.review.lead")}</p>
      <label className="flex flex-col gap-1.5">
        <span className="font-bold text-heading">{t("admin.content.transition.note")}</span>
        <Input
          name="review-note"
          value={note}
          maxLength={CONTENT_LIMITS.changeNoteMaxLength}
          placeholder={t("admin.content.transition.notePlaceholder")}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div>
        <Button type="button" disabled={pending} onClick={() => setConfirming(true)}>
          {t("admin.content.review.action")}
        </Button>
      </div>

      {confirming && (
        <Alert className="flex flex-col items-start gap-3">
          <span>{t("admin.content.review.confirm")}</span>
          <div className="flex gap-3">
            <Button type="button" onClick={() => void run()}>
              {t("admin.content.review.action")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </Alert>
      )}

      {done && <Alert variant="success">{t("admin.content.review.done")}</Alert>}
      {failure && <ErrorAlert failure={failure} />}
    </section>
  );
}
