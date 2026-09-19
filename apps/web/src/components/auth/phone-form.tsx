"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { authClient } from "@/lib/auth-client";
import { describeAuthError, runAuth } from "@/lib/auth-errors";
import { toNigerianE164 } from "@/lib/phone";

const RESEND_COOLDOWN_SECONDS = 60;

/** Phone sign-in: one form for new and returning users (the API creates the account on first verify). */
export function PhoneForm({ next }: { next: string }) {
  const [phone, setPhone] = useState<string>();
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async (phoneNumber: string) => {
    const result = await runAuth(() => authClient().phoneNumber.sendOtp({ phoneNumber }));
    if (!result.error) {
      setPhone(phoneNumber);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    }
    return result.error ? describeAuthError(result.error) : undefined;
  };

  return phone ? (
    <CodeStep
      phone={phone}
      next={next}
      cooldown={cooldown}
      onResend={() => sendCode(phone)}
      onChangeNumber={() => setPhone(undefined)}
    />
  ) : (
    <NumberStep onSend={sendCode} />
  );
}

function NumberStep({
  onSend,
}: {
  onSend: (phone: string) => Promise<ReturnType<typeof describeAuthError> | undefined>;
}) {
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ number: string }>();

  const onSubmit = handleSubmit(async ({ number }) => {
    setFormError(undefined);
    const phone = toNigerianE164(number);
    if (!phone) {
      setError("number", { message: t("auth.errors.invalidPhone") });
      return;
    }
    const error = await onSend(phone);
    if (error?.field === "phoneNumber") setError("number", { message: error.message });
    else if (error) setFormError(error.message);
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}
      <Field
        id="number"
        label={t("auth.phone.numberLabel")}
        hint={t("auth.phone.numberHint")}
        error={errors.number?.message}
      >
        {(describedBy) => (
          <div className="flex items-center gap-2">
            <span aria-hidden className="rounded-md border bg-muted px-3 py-2.5 text-base">
              +234
            </span>
            <Input
              id="number"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              aria-invalid={Boolean(errors.number)}
              aria-describedby={describedBy}
              {...register("number", { required: t("common.errors.required") })}
            />
          </div>
        )}
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {t("auth.phone.send")}
      </Button>
    </form>
  );
}

function CodeStep({
  phone,
  next,
  cooldown,
  onResend,
  onChangeNumber,
}: {
  phone: string;
  cooldown: number;
  onResend: () => Promise<ReturnType<typeof describeAuthError> | undefined>;
  onChangeNumber: () => void;
  next: string;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const [resending, setResending] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ code: string }>();

  const onSubmit = handleSubmit(async ({ code }) => {
    setFormError(undefined);
    const result = await runAuth(() =>
      authClient().phoneNumber.verify({ phoneNumber: phone, code }),
    );
    if (result.error) {
      const { message, field } = describeAuthError(result.error);
      if (field === "code") setError("code", { message });
      else setFormError(message);
      return;
    }
    // New users are sent on to onboarding by the home page (the default `next`).
    router.replace(next);
    router.refresh();
  });

  async function resend() {
    setResending(true);
    setFormError((await onResend())?.message);
    setResending(false);
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      <p className="text-muted-foreground">{t("auth.phone.codeSent", { phone })}</p>
      {formError && <Alert variant="error">{formError}</Alert>}
      <Field id="code" label={t("auth.phone.codeLabel")} error={errors.code?.message}>
        {(describedBy) => (
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="tracking-[0.5em]"
            aria-invalid={Boolean(errors.code)}
            aria-describedby={describedBy}
            {...register("code", {
              required: t("common.errors.required"),
              pattern: { value: /^\d{6}$/, message: t("auth.errors.invalidOtp") },
            })}
          />
        )}
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {t("auth.phone.verify")}
      </Button>
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="link"
          className="px-0"
          disabled={cooldown > 0 || resending}
          onClick={() => void resend()}
        >
          {cooldown > 0 ? t("auth.phone.resendIn", { seconds: cooldown }) : t("auth.phone.resend")}
        </Button>
        <Button type="button" variant="link" className="px-0" onClick={onChangeNumber}>
          {t("auth.phone.changeNumber")}
        </Button>
      </div>
    </form>
  );
}
