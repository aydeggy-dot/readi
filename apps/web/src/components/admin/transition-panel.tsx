"use client";

import type {
  ContentEntityPath,
  ContentStatus,
  ContentTransition,
  DuplicateMatch,
  Role,
} from "@readi/shared-types";
import { availableTransitions, CONTENT_LIMITS } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DuplicateWarnings } from "@/components/admin/duplicate-warnings";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import { contentErrorMessage } from "@/lib/content-errors";

/**
 * Moving one item through the workflow (ADR-0014 decision 1). Only the moves this role can make
 * from this status are drawn, from the same table the API enforces
 * (`@readi/shared-types/constants`), so the CMS never offers a button that would be refused.
 *
 * Publishing and retiring ask again before they act: both change what candidates can see, right
 * now. It is a second click rather than a typed word — the moves are reversible (`retired → draft`),
 * and a modal at 360px costs more than it protects.
 */
export function TransitionPanel({
  entity,
  id,
  status,
  role,
}: {
  entity: ContentEntityPath;
  id: string;
  status: ContentStatus;
  role: Role;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<ContentTransition | null>(null);
  const [confirming, setConfirming] = useState<ContentTransition | null>(null);
  const [done, setDone] = useState<ContentStatus | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [failure, setFailure] = useState<ApiFailure>();

  const moves = availableTransitions(status, role);

  const run = async (transition: ContentTransition) => {
    setPending(transition);
    setConfirming(null);
    setFailure(undefined);
    setDone(null);
    try {
      const { data, error, response } = await browserApi.POST(
        "/api/admin/content/{entity}/{id}/transition",
        { params: { path: { entity, id } }, body: { transition, note: note.trim() || null } },
      );
      if (!data) {
        const message = contentErrorMessage(error);
        setFailure(message ? { message, signedOut: false } : apiFailure(response.status));
        return;
      }
      setDone(data.status);
      setDuplicates(data.duplicates);
      setNote("");
      router.refresh();
    } catch {
      setFailure(networkFailure());
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="flex flex-col gap-4 border-t border-frame pt-6">
      <h2 className="text-xl leading-tight">{t("admin.content.transition.legend")}</h2>
      {moves.length === 0 ? (
        <p className="text-base text-muted-foreground">{t("admin.content.transition.nothing")}</p>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="font-bold text-heading">{t("admin.content.transition.note")}</span>
            <Input
              name="note"
              value={note}
              maxLength={CONTENT_LIMITS.changeNoteMaxLength}
              placeholder={t("admin.content.transition.notePlaceholder")}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            {moves.map((transition) => (
              <Button
                key={transition}
                type="button"
                variant={transition === "publish" ? "default" : "outline"}
                disabled={pending !== null}
                onClick={() =>
                  transition === "publish" || transition === "retire"
                    ? setConfirming(transition)
                    : void run(transition)
                }
              >
                {t(`admin.content.transition.${transition}`)}
              </Button>
            ))}
          </div>
        </>
      )}

      {confirming && (
        <Alert className="flex flex-col items-start gap-3">
          <span>
            {confirming === "retire"
              ? t("admin.content.transition.confirmRetire")
              : t("admin.content.transition.confirmPublish")}
          </span>
          <div className="flex gap-3">
            <Button type="button" onClick={() => void run(confirming)}>
              {t(`admin.content.transition.${confirming}`)}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        </Alert>
      )}

      {done && (
        <Alert variant="success">
          {t("admin.content.transition.done", { status: t(`admin.content.status.${done}`) })}
        </Alert>
      )}
      {duplicates.length > 0 && <DuplicateWarnings matches={duplicates} />}
      {failure && <ErrorAlert failure={failure} />}
    </section>
  );
}
