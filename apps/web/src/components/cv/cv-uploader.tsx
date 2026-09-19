"use client";

import type { CvResponse } from "@readi/shared-types";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { browserApi } from "@/lib/browser-api";
import { CV_MAX_MB, checkCvFile, cvContentType, putWithProgress } from "@/lib/cv-file";

type Stage = { kind: "idle" } | { kind: "uploading"; percent: number } | { kind: "checking" };

/** Picks a file, uploads it straight to storage (presigned URL) and confirms it with the API. */
export function CvUploader({
  label,
  variant = "default",
  onUploaded,
}: {
  label: string;
  variant?: "default" | "outline";
  onUploaded: (cv: CvResponse) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<string>();

  async function upload(file: File) {
    setError(undefined);
    const problem = checkCvFile(file);
    const contentType = cvContentType(file);
    if (problem || !contentType) {
      setError(
        problem === "tooLarge"
          ? t("cv.errors.tooLarge", { mb: CV_MAX_MB })
          : problem === "empty"
            ? t("cv.errors.empty")
            : t("cv.errors.type"),
      );
      return;
    }
    try {
      setStage({ kind: "uploading", percent: 0 });
      const created = await browserApi.POST("/api/me/cv/uploads", {
        body: { content_type: contentType, size_bytes: file.size },
      });
      if (!created.data) {
        setError(
          t(
            created.response.status === 429 ? "common.errors.rateLimited" : "common.errors.generic",
          ),
        );
        return;
      }
      const { upload_id, url, headers } = created.data;
      const status = await putWithProgress(url, headers, file, (fraction) =>
        setStage({ kind: "uploading", percent: Math.round(fraction * 100) }),
      );
      if (status < 200 || status >= 300) {
        setError(t("cv.errors.upload"));
        return;
      }
      setStage({ kind: "checking" });
      const confirmed = await browserApi.POST("/api/me/cv", { body: { upload_id } });
      if (!confirmed.data) {
        const code = confirmed.response.status;
        setError(
          code === 422
            ? t("cv.errors.invalidFile")
            : code === 429
              ? t("common.errors.rateLimited")
              : t("common.errors.generic"),
        );
        return;
      }
      onUploaded(confirmed.data);
    } catch {
      setError(t("common.errors.network"));
    } finally {
      setStage({ kind: "idle" });
    }
  }

  const busy = stage.kind !== "idle";
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      <Button
        type="button"
        variant={variant}
        disabled={busy}
        className="w-full sm:w-auto sm:self-start"
        onClick={() => input.current?.click()}
      >
        {stage.kind === "uploading"
          ? t("cv.uploading", { percent: stage.percent })
          : stage.kind === "checking"
            ? t("cv.checking")
            : label}
      </Button>
      {stage.kind === "uploading" && (
        <div
          role="progressbar"
          aria-valuenow={stage.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("cv.uploading", { percent: stage.percent })}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${stage.percent}%` }}
          />
        </div>
      )}
      <p className="text-sm text-muted-foreground">{t("cv.hint", { mb: CV_MAX_MB })}</p>
      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
