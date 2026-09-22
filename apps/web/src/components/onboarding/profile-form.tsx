"use client";

import type {
  CandidateCareerRole,
  ProfileResponse,
  UpdateProfileRequest,
} from "@readi/shared-types";
import { invalidFields } from "@readi/api-client";
import { PROFILE_LIMITS, TARGET_COMPANY_TYPES } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import { profileErrorMessage } from "@/lib/profile-errors";

type Values = Omit<UpdateProfileRequest, "years_experience" | "target_date"> & {
  // Form inputs hold strings; converted on submit.
  years_experience: string;
  target_date: string;
};

/**
 * The career profile (spec §4.1), used in onboarding and on the profile page.
 *
 * Everything on it that used to be a closed set is now the catalogue, read from the API by the page
 * that draws this form (ADR-0015): which roles exist, what each one is called, the levels it is
 * hired at, and the technologies worth suggesting for its stack. Nothing here knows any of them.
 */
export function ProfileForm({
  initial,
  name,
  mode,
  today,
  roles,
}: {
  initial: ProfileResponse | null;
  name: string;
  mode: "onboarding" | "edit";
  /** YYYY-MM-DD, from the server, so the date picker's minimum matches server rendering. */
  today: string;
  /** The published catalogue: the only roles a candidate may prepare for, in the API's order. */
  roles: readonly CandidateCareerRole[];
}) {
  const router = useRouter();
  const [failure, setFailure] = useState<ApiFailure>();
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      name: initial?.name ?? name,
      target_role: initial?.target_role ?? "",
      level: initial?.level ?? "",
      years_experience: initial ? String(initial.years_experience) : "",
      stack: initial?.stack ?? [],
      target_company_type: initial?.target_company_type,
      target_date: initial?.target_date ?? "",
    },
  });
  const roleSlug = useWatch({ control, name: "target_role" });
  const role = roles.find((candidate) => candidate.slug === roleSlug);
  const levelOptions = role?.level_options ?? [];

  /*
   * A level belongs to the role that offers it, so changing the role changes the ladder. A level
   * the new role is not hired at has to go with it: its radio is no longer drawn, so leaving the
   * value behind would submit a choice nobody can see, and the API would answer
   * `level_not_offered_for_role` about a field the form looks happy with.
   */
  const offered = levelOptions.map((option) => option.slug).join(" ");
  useEffect(() => {
    const chosen = getValues("level");
    if (chosen && !offered.split(" ").includes(chosen)) setValue("level", "");
  }, [offered, getValues, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setFailure(undefined);
    const body: UpdateProfileRequest = {
      ...values,
      years_experience: Number(values.years_experience),
      target_date: values.target_date || null,
    };
    try {
      const { error, response } = await browserApi.PUT("/api/me/profile", { body });
      if (response.status === 400) {
        // The catalogue moved under the form: say which choice went stale, not "check this field".
        const stale = profileErrorMessage(error);
        if (stale) {
          setFailure({ message: stale, signedOut: false });
          return;
        }
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
        if (fields.length === 0) setFailure(apiFailure(response.status));
        return;
      }
      if (!response.ok) {
        setFailure(apiFailure(response.status));
        return;
      }
    } catch {
      setFailure(networkFailure());
      return;
    }
    router.push(mode === "onboarding" ? "/onboarding/cv" : "/profile");
    router.refresh();
  });

  const required = t("common.errors.required");

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-6">
      {failure && <ErrorAlert failure={failure} />}

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

      {roles.length === 0 ? (
        <Aside legend={t("profileForm.targetRole")} note={t("profileForm.noRoles")} />
      ) : (
        <ChoiceGroup
          name="target_role"
          legend={t("profileForm.targetRole")}
          options={roles.map((option) => ({ value: option.slug, label: option.name }))}
          error={errors.target_role?.message}
          inputProps={register("target_role", { required })}
        />
      )}

      {/* The levels of the chosen role, so the picker can only offer what the role is hired at. */}
      {levelOptions.length === 0 ? (
        <Aside
          legend={t("profileForm.level")}
          note={role ? t("profileForm.levelNone") : t("profileForm.levelAfterRole")}
        />
      ) : (
        <ChoiceGroup
          name="level"
          legend={t("profileForm.level")}
          columns={2}
          options={levelOptions.map((option) => ({ value: option.slug, label: option.name }))}
          error={errors.level?.message}
          inputProps={register("level", { required })}
        />
      )}

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
                suggestions={role?.stacks.map((option) => option.name) ?? []}
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

/** A choice that cannot be made yet, in the shape of the group it stands in for. */
function Aside({ legend, note }: { legend: string; note: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-bold text-heading">{legend}</legend>
      <p className="text-base text-muted-foreground">{note}</p>
    </fieldset>
  );
}
