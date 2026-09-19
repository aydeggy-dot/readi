"use client";

import { errorCode } from "@readi/api-client";
import { ACCOUNT_DELETION } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { authClient } from "@/lib/auth-client";
import { runAuth } from "@/lib/auth-errors";
import { browserApi } from "@/lib/browser-api";

const WORD = ACCOUNT_DELETION.confirmation;
const RETURN_PATH = "/profile/account";

interface Values {
  confirmation: string;
}

/**
 * Account deletion (ADR-0011): typed confirmation, and a sign-in within the last few minutes
 * (checked by the API). On success the server has already revoked every session.
 */
export function DeleteAccountForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>();

  const onSubmit = handleSubmit(async () => {
    setFormError(undefined);
    setNeedsSignIn(false);
    try {
      const { data, error, response } = await browserApi.POST("/api/me/deletion", {
        body: { confirmation: WORD },
      });
      if (!data) {
        if (errorCode(error) === "recent_sign_in_required") setNeedsSignIn(true);
        else
          setFormError(
            t(response.status === 429 ? "common.errors.rateLimited" : "common.errors.generic"),
          );
        return;
      }
      // Clears the (already revoked) session cookie from the browser.
      await runAuth(() => authClient().signOut());
      router.replace(`/account-deleted?on=${data.deletion_scheduled_for.slice(0, 10)}`);
      router.refresh();
    } catch {
      setFormError(t("common.errors.network"));
    }
  });

  async function signInAgain() {
    await runAuth(() => authClient().signOut());
    router.replace(`/login?next=${encodeURIComponent(RETURN_PATH)}`);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}
      {needsSignIn && (
        <Alert variant="error" className="flex flex-col items-start gap-3">
          <span>
            {t("account.delete.recentSignIn", { minutes: ACCOUNT_DELETION.recentSignInMinutes })}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => void signInAgain()}>
            {t("account.delete.signInAgain")}
          </Button>
        </Alert>
      )}
      <Field
        id="confirmation"
        label={t("account.delete.confirmLabel", { word: WORD })}
        hint={t("account.delete.confirmHint", { minutes: ACCOUNT_DELETION.recentSignInMinutes })}
        error={errors.confirmation?.message}
      >
        {(describedBy) => (
          <Input
            id="confirmation"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={Boolean(errors.confirmation)}
            aria-describedby={describedBy}
            {...register("confirmation", {
              // Trailing spaces from mobile keyboards are forgiven; the word itself must match.
              validate: (value) =>
                value.trim() === WORD || t("account.delete.confirmMismatch", { word: WORD }),
            })}
          />
        )}
      </Field>
      <Button
        type="submit"
        variant="destructive"
        disabled={isSubmitting}
        className="w-full sm:w-auto sm:self-start"
      >
        {isSubmitting ? t("account.delete.deleting") : t("account.delete.button")}
      </Button>
    </form>
  );
}
