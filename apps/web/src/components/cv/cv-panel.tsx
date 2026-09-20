"use client";

import type { CvResponse } from "@readi/shared-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { formatDate, t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import { CvEditor } from "./cv-editor";
import { CvUploader } from "./cv-uploader";

const CV_QUERY_KEY = ["me", "cv"] as const;
const POLL_MS = 2000;

async function fetchCv(): Promise<CvResponse> {
  const { data, response } = await browserApi.GET("/api/me/cv");
  if (!data) throw new Error(`GET /api/me/cv failed with HTTP ${response.status}`);
  return data;
}

const UNREADABLE_ERRORS = ["no_text", "encrypted", "invalid_file", "too_large"] as const;

function problemMessage(cv: CvResponse): string {
  const error = UNREADABLE_ERRORS.find((code) => code === cv.error);
  return error ? t(`cv.errors.${error}`) : t("cv.errors.retry");
}

/** The CV: upload, live parsing status (polled), review/edit, replace and remove. */
export function CvPanel({
  initial,
  mode,
}: {
  initial: CvResponse;
  mode: "onboarding" | "profile";
}) {
  const queryClient = useQueryClient();
  const { data: cv } = useQuery({
    queryKey: CV_QUERY_KEY,
    queryFn: fetchCv,
    initialData: initial,
    refetchInterval: (query) => (query.state.data?.status === "processing" ? POLL_MS : false),
  });
  const [manual, setManual] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeFailure, setRemoveFailure] = useState<ApiFailure>();
  const update = (next: CvResponse) => queryClient.setQueryData(CV_QUERY_KEY, next);

  async function remove() {
    setRemoveFailure(undefined);
    try {
      const { data, response } = await browserApi.DELETE("/api/me/cv");
      if (!data) {
        setRemoveFailure(apiFailure(response.status));
        return;
      }
      setManual(false);
      setConfirmRemove(false);
      update(data);
    } catch {
      setRemoveFailure(networkFailure());
    }
  }

  const uploadedOn = cv.uploaded_at ? formatDate(cv.uploaded_at.slice(0, 10)) : null;
  const showEditor = cv.status === "parsed" || (manual && cv.status !== "processing");
  const manualFromScratch = manual && cv.status === "none";

  return (
    <div className="flex flex-col gap-6">
      {cv.status === "none" && !manual && (
        <div className="flex flex-col gap-3">
          <CvUploader label={t("cv.choose")} onUploaded={update} />
          <p className="text-sm text-muted-foreground">{t("cv.privacyNote")}</p>
          {/* Plenty of junior candidates have no CV file at all; they can still fill this in. */}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => setManual(true)}
          >
            {t("cv.fillManuallyFirst")}
          </Button>
        </div>
      )}

      {cv.status === "processing" && (
        <Alert className="flex items-center gap-3">
          <span
            aria-hidden
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent"
          />
          <span>{t("cv.processing")}</span>
        </Alert>
      )}

      {(cv.status === "unreadable" || cv.status === "failed") && !manual && (
        <div className="flex flex-col gap-3">
          <Alert variant="error">{problemMessage(cv)}</Alert>
          <CvUploader label={t("cv.replace")} onUploaded={update} />
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => setManual(true)}
          >
            {t("cv.fillManually")}
          </Button>
        </div>
      )}

      {showEditor && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">
              {cv.status === "parsed" ? t("cv.reviewTitle") : t("cv.manualTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("cv.reviewHint")}</p>
          </div>
          <CvEditor
            key={`${cv.status}-${cv.parsed_at ?? ""}`}
            parsed={cv.parsed}
            onSaved={(next) => {
              setManual(false);
              update(next);
            }}
          />
        </section>
      )}

      {manualFromScratch && (
        <CvUploader label={t("cv.choose")} variant="outline" onUploaded={update} />
      )}

      {cv.status !== "none" && cv.status !== "processing" && (
        <div className="flex flex-col gap-3 border-t pt-4">
          {uploadedOn && (
            <p className="text-sm text-muted-foreground">
              {t("cv.uploadedOn", { date: uploadedOn })}
            </p>
          )}
          {(cv.status === "parsed" || manual) && (
            <CvUploader label={t("cv.replace")} variant="outline" onUploaded={update} />
          )}
          {mode === "profile" &&
            (confirmRemove ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm">{t("cv.removeConfirm")}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => void remove()}>
                    {t("cv.remove")}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirmRemove(false)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="self-start"
                onClick={() => setConfirmRemove(true)}
              >
                {t("cv.remove")}
              </Button>
            ))}
          {removeFailure && <ErrorAlert failure={removeFailure} />}
        </div>
      )}

      {mode === "onboarding" && (
        <Button
          asChild
          variant={cv.status === "none" ? "ghost" : "default"}
          className="w-full sm:w-auto sm:self-start"
        >
          <Link href="/onboarding/consent">
            {cv.status === "none" ? t("onboarding.cv.skip") : t("cv.continue")}
          </Link>
        </Button>
      )}
    </div>
  );
}
