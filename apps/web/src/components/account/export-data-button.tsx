"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import { filenameFromDisposition, saveBlob } from "@/lib/download";

/**
 * Downloads the data export (ADR-0011). Fetched rather than linked, so a failure (e.g. rate
 * limiting) is explained on the page instead of being saved as an error file.
 */
export function ExportDataButton() {
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [failure, setFailure] = useState<ApiFailure>();

  async function download() {
    setState("working");
    setFailure(undefined);
    try {
      const { data, response } = await browserApi.GET("/api/me/export", { parseAs: "blob" });
      if (!data) {
        setFailure(apiFailure(response.status));
        setState("idle");
        return;
      }
      const filename =
        filenameFromDisposition(response.headers.get("content-disposition")) ?? "readi-data.json";
      saveBlob(data, filename);
      setState("done");
    } catch {
      setFailure(networkFailure());
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-auto sm:self-start"
        disabled={state === "working"}
        onClick={() => void download()}
      >
        {state === "working" ? t("account.export.preparing") : t("account.export.button")}
      </Button>
      {state === "done" && <Alert variant="success">{t("account.export.done")}</Alert>}
      {failure && <ErrorAlert failure={failure} />}
    </div>
  );
}
