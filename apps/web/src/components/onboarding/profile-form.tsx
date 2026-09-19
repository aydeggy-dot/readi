"use client";

import type { ProfileResponse, TargetRole, UpdateProfileRequest } from "@readi/shared-types";
import { invalidFields } from "@readi/api-client";
import {
  EXPERIENCE_LEVELS,
  PROFILE_LIMITS,
  TARGET_COMPANY_TYPES,
  TARGET_ROLES,
} from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { t } from "@/i18n";
import { browserApi } from "@/lib/browser-api";
import { STACK_SUGGESTIONS } from "@/lib/stack-suggestions";

type Values = Omit<UpdateProfileRequest, "years_experience" | "target_date"> & {
  // Form inputs hold strings; converted on submit.
  years_experience: string;
  target_date: string;
};

/** The career profile (spec §4.1), used in onboarding and on the profile page. */
export function ProfileForm({
  initial,
  name,
  mode,
  today,
}: {
  initial: ProfileResponse | null;
  name: string;
  mode: "onboarding" | "edit";
  /** YYYY-MM-DD, from the server, so the date picker's minimum matches server rendering. */
  today: string;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      name: initial?.name ?? name,
      target_role: initial?.target_role,
      level: initial?.level,
      years_experience: initial ? String(initial.years_experience) : "",
      stack: initial?.stack ?? [],
      target_company_type: initial?.target_company_type,
      target_date: initial?.target_date ?? "",
    },
  });
  const role: TargetRole | undefined = useWatch({ control, name: "target_role" });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const body: UpdateProfileRequest = {
      ...values,
      years_experience: Number(values.years_experience),
      target_date: values.target_date || null,
    };
    try {
      const { error, response } = await browserApi.PUT("/api/me/profile", { body });
      if (response.status === 400) {
        const fields = invalidFields(error);
        for (const field of fields) {
          if (field in body) {
            setError(field as keyof Values, {
              message:
                field === "target_date"
                  ? t("profileForm.errors.datePast")
                  : t("common.errors.invalidField"),
            });
          }
        }
        if (fields.length === 0) setFormError(t("common.errors.generic"));
        return;
      }
      if (!response.ok) {
        setFormError(
          t(response.status === 429 ? "common.errors.rateLimited" : "common.errors.generic"),
        );
        return;
      }
    } catch {
      setFormError(t("common.errors.network"));
      return;
    }
    router.push(mode === "onboarding" ? "/onboarding/cv" : "/profile");
    router.refresh();
  });

  const required = t("common.errors.required");

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      <Field id="name" label={t("profileForm.name")} error={errors.name?.message}>
        {(describedBy) => (
          <Input
            id="name"
            autoComplete="given-name"
            maxLength={PROFILE_LIMITS.nameMaxLength}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy}
            {...register("name", {
              required,
              validate: (value) => value.trim().length > 0 || required,
            })}
          />
        )}
      </Field>

      <ChoiceGroup
        name="target_role"
        legend={t("profileForm.targetRole")}
        options={TARGET_ROLES.map((value) => ({ value, label: t(`targetRoles.${value}`) }))}
        error={errors.target_role?.message}
        inputProps={register("target_role", { required })}
      />

      <ChoiceGroup
        name="level"
        legend={t("profileForm.level")}
        columns={2}
        options={EXPERIENCE_LEVELS.map((value) => ({ value, label: t(`levels.${value}`) }))}
        error={errors.level?.message}
        inputProps={register("level", { required })}
      />

      <Field
        id="years_experience"
        label={t("profileForm.yearsExperience")}
        error={errors.years_experience?.message}
      >
        {(describedBy) => (
          <Input
            id="years_experience"
            type="number"
            inputMode="numeric"
            min={0}
            max={PROFILE_LIMITS.yearsExperienceMax}
            step={1}
            className="max-w-32"
            aria-invalid={Boolean(errors.years_experience)}
            aria-describedby={describedBy}
            {...register("years_experience", {
              required,
              validate: (value) =>
                (/^\d{1,2}$/.test(value) && Number(value) <= PROFILE_LIMITS.yearsExperienceMax) ||
                t("profileForm.errors.yearsRange", { max: PROFILE_LIMITS.yearsExperienceMax }),
            })}
          />
        )}
      </Field>

      <Field
        id="stack"
        label={t("profileForm.stack")}
        hint={t("profileForm.stackHint")}
        error={errors.stack?.message}
      >
        {(describedBy) => (
          <Controller
            control={control}
            name="stack"
            rules={{
              validate: (value) =>
                value.length > 0 ? true : t("profileForm.errors.stackRequired"),
            }}
            render={({ field, fieldState }) => (
              <TagInput
                id="stack"
                value={field.value}
                onChange={field.onChange}
                placeholder={t("profileForm.stackPlaceholder")}
                maxItems={PROFILE_LIMITS.stackMaxItems}
                maxLength={PROFILE_LIMITS.stackItemMaxLength}
                suggestions={role ? STACK_SUGGESTIONS[role] : []}
                invalid={fieldState.invalid}
                describedBy={describedBy}
              />
            )}
          />
        )}
      </Field>

      <ChoiceGroup
        name="target_company_type"
        legend={t("profileForm.targetCompanyType")}
        options={TARGET_COMPANY_TYPES.map((value) => ({
          value,
          label: t(`companyTypes.${value}`),
        }))}
        error={errors.target_company_type?.message}
        inputProps={register("target_company_type", { required })}
      />

      <Field
        id="target_date"
        label={t("profileForm.targetDate")}
        hint={t("profileForm.targetDateHint")}
        error={errors.target_date?.message}
      >
        {(describedBy) => (
          <Input
            id="target_date"
            type="date"
            min={today}
            className="max-w-60"
            aria-invalid={Boolean(errors.target_date)}
            aria-describedby={describedBy}
            {...register("target_date", {
              validate: (value) => !value || value >= today || t("profileForm.errors.datePast"),
            })}
          />
        )}
      </Field>

      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto sm:self-start">
        {isSubmitting
          ? t("common.saving")
          : mode === "onboarding"
            ? t("onboarding.continue")
            : t("profileForm.save")}
      </Button>
    </form>
  );
}
