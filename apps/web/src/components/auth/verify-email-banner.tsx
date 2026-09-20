"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { authClient } from "@/lib/auth-client";
import { describeAuthError, runAuth } from "@/lib/auth-errors";

/** Shown until the email is verified; verification is required before checkout (M8), not before. */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string>();

  async function resend() {
    setState("sending");
    setError(undefined);
    const result = await runAuth(() =>
      authClient().sendVerificationEmail({ email, callbackURL: "/home" }),
    );
    if (result.error) {
      setError(describeAuthError(result.error).message);
      setState("idle");
    } else {
      setState("sent");
    }
  }

  return (
    <Alert className="flex flex-col gap-2">
      <p>{t("verifyEmail.message", { email })}</p>
      {state === "sent" ? (
        <p className="font-bold">{t("verifyEmail.sent")}</p>
      ) : (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="self-start px-0"
          disabled={state === "sending"}
          onClick={() => void resend()}
        >
          {t("verifyEmail.resend")}
        </Button>
      )}
      {error && <p className="text-destructive">{error}</p>}
    </Alert>
  );
}
