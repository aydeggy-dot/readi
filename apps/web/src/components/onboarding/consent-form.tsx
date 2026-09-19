"use client";

import type { ConsentStatus, ConsentType } from "@readi/shared-types";
import { errorCode } from "@readi/api-client";
import { CONSENT_TYPES, CONSENT_VERSIONS } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxCard } from "@/components/ui/checkbox-card";
import { t } from "@/i18n";
import { browserApi } from "@/lib/browser-api";
import { consentCopy } from "@/lib/consent-copy";
import { HOME_PATH } from "@/lib/navigation";

type Values = Record<ConsentType, boolean>;

/**
 * Consent choices. Nothing is pre-ticked: consent must be an explicit opt-in (NDPA 2023, GDPR).
 * In onboarding, saving also completes onboarding.
 */
export function ConsentForm({
  consents,
  mode,
}: {
  consents: ConsentStatus[];
  mode: "onboarding" | "edit";
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Values>({
    defaultValues: Object.fromEntries(
      CONSENT_TYPES.map((type) => [type, consents.find((c) => c.type === type)?.granted ?? false]),
    ) as Values,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      const decisions = CONSENT_TYPES.map((type) => ({
        type,
        granted: values[type],
        version: CONSENT_VERSIONS[type],
      }));
      const saved = await browserApi.PUT("/api/me/consents", { body: { decisions } });
      if (!saved.response.ok) {
        setFormError(
          errorCode(saved.error) === "consent_version_outdated"
            ? t("consent.outdated")
            : t(
                saved.response.status === 429
                  ? "common.errors.rateLimited"
                  : "common.errors.generic",
              ),
        );
        return;
      }
      if (mode === "onboarding") {
        const completed = await browserApi.POST("/api/me/onboarding/complete");
        if (!completed.response.ok) {
          setFormError(t("common.errors.generic"));
          return;
        }
      }
    } catch {
      setFormError(t("common.errors.network"));
      return;
    }
    router.push(mode === "onboarding" ? HOME_PATH : "/profile");
    router.refresh();
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}
      {CONSENT_TYPES.map((type) => {
        const copy = consentCopy(type);
        return (
          <CheckboxCard
            key={type}
            title={copy.title}
            description={copy.body}
            note={type === "audio_processing" ? t("consent.audioNote") : undefined}
            {...register(type)}
          />
        );
      })}
      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto sm:self-start">
        {isSubmitting
          ? t("common.saving")
          : mode === "onboarding"
            ? t("onboarding.continue")
            : t("consent.save")}
      </Button>
    </form>
  );
}
