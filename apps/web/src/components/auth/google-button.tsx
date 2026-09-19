"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { authClient } from "@/lib/auth-client";
import { describeAuthError, runAuth } from "@/lib/auth-errors";

export function GoogleButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function start() {
    setPending(true);
    setError(undefined);
    // On success the browser is sent to Google, then back through /api/auth/callback/google.
    const result = await runAuth(() =>
      authClient().signIn.social({
        provider: "google",
        callbackURL: next,
        newUserCallbackURL: "/onboarding",
        errorCallbackURL: "/login?error=google",
      }),
    );
    if (result.error) {
      setError(describeAuthError(result.error).message);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" disabled={pending} onClick={() => void start()}>
        {t("auth.google")}
      </Button>
      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
