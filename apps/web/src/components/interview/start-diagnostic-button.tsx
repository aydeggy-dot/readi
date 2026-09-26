"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import { interviewErrorMessage } from "@/lib/interview-errors";

/**
 * The diagnostic on `/home`: one tap, not a setup screen.
 *
 * It is a preset by definition — fifteen minutes, every kind of question the candidate's role
 * supports, their own role and level from their profile — so there is nothing to choose, and the API
 * **refuses** a diagnostic that names types or another length rather than ignoring them
 * (`typesFor` in `interviews.service.ts`). Sending nothing but the length and the flag is therefore
 * the whole request.
 *
 * Starting it abandons whatever interview was running, which is why the Practice list is where a
 * candidate with one in flight is steered (`/home` says so once they have taken this).
 */
export function StartDiagnosticButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure>();

  const start = async () => {
    setBusy(true);
    setFailure(undefined);
    try {
      const { data, error, response } = await browserApi.POST("/api/interviews", {
        body: { minutes: 15, is_diagnostic: true },
      });
      if (!data) {
        const message = interviewErrorMessage(error);
        setFailure(message ? { message, signedOut: false } : apiFailure(response.status));
        setBusy(false);
        return;
      }
      // No `setBusy(false)`: the button stays disabled while the interview screen loads.
      router.push(`/interview/${data.id}`);
    } catch {
      setFailure(networkFailure());
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Button
        size="lg"
        disabled={busy}
        className="w-full sm:w-auto sm:self-start"
        onClick={() => void start()}
      >
        {busy ? t("interview.setup.starting") : t("home.diagnostic.cta")}
      </Button>
      {failure && <ErrorAlert failure={failure} />}
    </div>
  );
}
