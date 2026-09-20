"use client";

import { PASSWORD_LIMITS } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { authClient } from "@/lib/auth-client";
import { describeAuthError, runAuth } from "@/lib/auth-errors";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>();

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(undefined);
    const result = await runAuth(() =>
      authClient().requestPasswordReset({ email, redirectTo: "/reset-password" }),
    );
    // Same answer whether or not the account exists; only transport problems are shown.
    if (result.error && (result.error.status === 0 || result.error.status === 429)) {
      setFormError(describeAuthError(result.error).message);
      return;
    }
    setSentTo(email);
  });

  if (sentTo) return <Alert variant="success">{t("auth.forgot.sent", { email: sentTo })}</Alert>;

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}
      <Field id="email" label={t("auth.email")} error={errors.email?.message}>
        {(describedBy) => (
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy}
            {...register("email", {
              required: t("common.errors.required"),
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: t("auth.errors.invalidEmail"),
              },
            })}
          />
        )}
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {t("auth.forgot.submit")}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ password: string }>();

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(undefined);
    const result = await runAuth(() =>
      authClient().resetPassword({ newPassword: password, token }),
    );
    if (result.error) {
      const { message, field } = describeAuthError(result.error);
      if (field === "password") setError("password", { message });
      else setFormError(message);
      return;
    }
    router.replace("/login?reset=1");
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}
      <Field
        id="password"
        label={t("auth.reset.label")}
        hint={t("auth.passwordHint", { min: PASSWORD_LIMITS.minLength })}
        error={errors.password?.message}
      >
        {(describedBy) => (
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={describedBy}
            {...register("password", {
              required: t("common.errors.required"),
              minLength: {
                value: PASSWORD_LIMITS.minLength,
                message: t("auth.errors.passwordTooShort", { min: PASSWORD_LIMITS.minLength }),
              },
              maxLength: {
                value: PASSWORD_LIMITS.maxLength,
                message: t("auth.errors.passwordTooLong", { max: PASSWORD_LIMITS.maxLength }),
              },
            })}
          />
        )}
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {t("auth.reset.submit")}
      </Button>
    </form>
  );
}
