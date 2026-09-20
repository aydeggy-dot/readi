"use client";

import { PASSWORD_LIMITS } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TextLink } from "@/components/ui/text-link";
import { t } from "@/i18n";
import { authClient } from "@/lib/auth-client";
import { describeAuthError, runAuth } from "@/lib/auth-errors";

interface Values {
  email: string;
  password: string;
}

/** Log-in or sign-up with email and password. */
export function EmailPasswordForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>();

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFormError(undefined);
    const result = await runAuth(() =>
      mode === "login"
        ? authClient().signIn.email({ email, password })
        : // The name is asked for in onboarding; the verification link lands on the home page.
          authClient().signUp.email({ email, password, name: "", callbackURL: "/home" }),
    );
    if (result.error) {
      const { message, field } = describeAuthError(result.error);
      if (field === "email" || field === "password") setError(field, { message });
      else setFormError(message);
      return;
    }
    router.replace(mode === "login" ? next : "/onboarding");
    router.refresh();
  });

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
      <Field
        id="password"
        label={t("auth.password")}
        hint={
          mode === "signup" ? t("auth.passwordHint", { min: PASSWORD_LIMITS.minLength }) : undefined
        }
        error={errors.password?.message}
      >
        {(describedBy) => (
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={describedBy}
            {...register("password", {
              required: t("common.errors.required"),
              ...(mode === "signup" && {
                minLength: {
                  value: PASSWORD_LIMITS.minLength,
                  message: t("auth.errors.passwordTooShort", { min: PASSWORD_LIMITS.minLength }),
                },
                maxLength: {
                  value: PASSWORD_LIMITS.maxLength,
                  message: t("auth.errors.passwordTooLong", { max: PASSWORD_LIMITS.maxLength }),
                },
              }),
            })}
          />
        )}
      </Field>
      {mode === "login" && (
        <TextLink href="/forgot-password" className="self-start text-base">
          {t("auth.login.forgot")}
        </TextLink>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {mode === "login" ? t("auth.login.submit") : t("auth.signup.submit")}
      </Button>
    </form>
  );
}
