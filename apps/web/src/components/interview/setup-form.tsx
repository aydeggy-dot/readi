"use client";

import type {
  CandidateCareerRole,
  CreateInterviewRequest,
  InterviewLength,
  ProfileResponse,
  QuestionType,
} from "@readi/shared-types";
import { invalidFields } from "@readi/api-client";
import { INTERVIEW_LENGTHS, PROFILE_LIMITS } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { CheckboxCard } from "@/components/ui/checkbox-card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Field, FieldError } from "@/components/ui/field";
import { Note } from "@/components/ui/margin";
import { TagInput } from "@/components/ui/tag-input";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import { interviewErrorMessage } from "@/lib/interview-errors";

/**
 * The "not one of these" radio. Not a slug and could not be one — `SLUG_PATTERN` allows no spaces —
 * which is the same sentinel `profile-form.tsx` uses for the same reason.
 */
const NO_STACK = "not one of these";

interface Values {
  /** A radio's value is a string; converted on submit. */
  minutes: string;
  role: string;
  level: string;
  stack: string;
  types: QuestionType[];
  /** Free text, only asked when no variant fits. It never touches which questions are offered. */
  tellUs: string[];
}

/**
 * Setting up a mock interview (the M3 plan, and the owner's decisions of 2026-09-25).
 *
 * Everything on it is the catalogue, read by the page that draws this and passed in: which roles
 * exist, the levels each is hired at, the variants it offers and **which kinds of question it is
 * interviewed with** (`supported_question_types`). Nothing here knows any of them — there is no
 * `TARGET_ROLES` constant and no `targetRoles.*` namespace (ADR-0015).
 *
 * Two things the screen is obliged to say, rather than leave to be discovered:
 *
 * - **What the interview covers and what it does not.** The coding round is [P2]; a product that
 *   prepares two rounds out of three must not imply it prepares three (product principle 1).
 * - **What "not one of these" buys** — the general questions for the role, because stack-specific
 *   ones only exist for a variant we offer. And then it asks what they *do* use, which changes
 *   nothing about this interview and is saved to their profile, because the right answer to a
 *   missing variant is usually to add the variant rather than to apologise for it.
 */
export function SetupForm({
  roles,
  profile,
}: {
  /** The published catalogue, in the API's order. */
  roles: readonly CandidateCareerRole[];
  /** Used for the defaults, and as the place the free-text answer lands. */
  profile: ProfileResponse;
}) {
  const router = useRouter();
  const [failure, setFailure] = useState<ApiFailure>();
  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      minutes: String(INTERVIEW_LENGTHS[0]),
      role: profile.target_role,
      level: profile.level,
      stack: profile.target_stack ?? NO_STACK,
      types: [],
      tellUs: [],
    },
  });

  const roleSlug = useWatch({ control, name: "role" });
  const role = roles.find((candidate) => candidate.slug === roleSlug);
  const levelOptions = role?.level_options ?? [];
  const stackOptions = role?.stacks ?? [];
  const supported = role?.supported_question_types ?? [];

  /*
   * A level belongs to the role that offers it, so changing the role changes the ladder — and a
   * level the new role is not hired at has to go with it, or the form submits a choice whose radio
   * is no longer drawn and the API refuses something that looks fine on screen. Exactly the rule in
   * `profile-form.tsx`, for exactly the same reason.
   */
  const offered = levelOptions.map((option) => option.slug).join(" ");
  useEffect(() => {
    const chosen = getValues("level");
    if (chosen && !offered.split(" ").includes(chosen)) setValue("level", "");
  }, [offered, getValues, setValue]);

  /*
   * The variant follows the role's own default when the role changes, and is otherwise left alone:
   * "not one of these" is a legitimate answer and must not be overwritten by a rule about validity,
   * which is the subtlety `profile-form.tsx` documents.
   */
  const defaultStack = stackOptions.find((option) => option.is_default)?.slug ?? NO_STACK;
  const lastRole = useRef(profile.target_role);
  useEffect(() => {
    if (lastRole.current === roleSlug) return;
    lastRole.current = roleSlug;
    setValue("stack", defaultStack);
  }, [roleSlug, defaultStack, setValue]);

  /*
   * Every kind of question the role supports, ticked: the preset mixed session is what a first round
   * usually is, so it is the default rather than a button. A role changing changes the list.
   */
  const supportedKey = supported.join(" ");
  useEffect(() => {
    setValue("types", supportedKey ? (supportedKey.split(" ") as QuestionType[]) : []);
  }, [supportedKey, setValue]);

  const chosenStack = useWatch({ control, name: "stack" });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(undefined);
    const types = values.types.filter((type) => supported.includes(type));
    const body: CreateInterviewRequest = {
      minutes: Number(values.minutes) as InterviewLength,
      role: values.role,
      level: values.level,
      stack: values.stack === NO_STACK ? null : values.stack,
      // Omitted is the preset mixed session, which is what "all of them" means (the primer §6.2).
      types: types.length === supported.length ? undefined : types,
      is_diagnostic: false,
    };

    /*
     * What they actually use, when we offer no variant that fits. Best effort and first: it is a
     * note to us, not part of the interview, so a profile that refuses the update must not stop
     * the interview starting.
     */
    if (body.stack === null && values.tellUs.length > 0) {
      const technologies = [...profile.technologies];
      for (const item of values.tellUs) {
        const seen = technologies.some((known) => known.toLowerCase() === item.toLowerCase());
        if (!seen && technologies.length < PROFILE_LIMITS.technologiesMaxItems) {
          technologies.push(item);
        }
      }
      try {
        const { updated_at: _updatedAt, ...current } = profile;
        await browserApi.PUT("/api/me/profile", { body: { ...current, technologies } });
      } catch {
        // Nothing to say: it is a note for us, and the interview is what they came for.
      }
    }

    try {
      const { data, error, response } = await browserApi.POST("/api/interviews", { body });
      if (!data) {
        const message = interviewErrorMessage(error);
        if (message) {
          setFailure({ message, signedOut: false });
          return;
        }
        // A field error is a malformed request rather than a refusal; name the field it names.
        const fields = invalidFields(error);
        setFailure(
          fields.length > 0
            ? { message: t("common.errors.invalidField"), signedOut: false }
            : apiFailure(response.status),
        );
        return;
      }
      router.push(`/interview/${data.id}`);
    } catch {
      setFailure(networkFailure());
    }
  });

  const required = t("common.errors.required");

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-7">
      {failure && <ErrorAlert failure={failure} />}

      <ChoiceGroup
        name="minutes"
        legend={t("interview.setup.length")}
        hint={t("interview.setup.lengthHint")}
        columns={2}
        options={INTERVIEW_LENGTHS.map((minutes) => ({
          value: String(minutes),
          label: `${t(`interview.setup.length${minutes}`)} · ${t(
            `interview.setup.length${minutes}Note`,
          )}`,
        }))}
        error={errors.minutes?.message}
        inputProps={register("minutes", { required })}
      />

      {roles.length === 0 ? (
        <p className="text-base text-muted-foreground">{t("interview.setup.noRoles")}</p>
      ) : (
        <ChoiceGroup
          name="role"
          legend={t("interview.setup.role")}
          options={roles.map((option) => ({ value: option.slug, label: option.name }))}
          error={errors.role?.message}
          inputProps={register("role", { required })}
        />
      )}

      {levelOptions.length === 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-bold text-heading">{t("interview.setup.level")}</legend>
          <p className="text-base text-muted-foreground">
            {role ? t("interview.setup.levelNone") : t("interview.setup.levelAfterRole")}
          </p>
        </fieldset>
      ) : (
        <ChoiceGroup
          name="level"
          legend={t("interview.setup.level")}
          columns={2}
          options={levelOptions.map((option) => ({ value: option.slug, label: option.name }))}
          error={errors.level?.message}
          inputProps={register("level", { required })}
        />
      )}

      {stackOptions.length > 0 && (
        <div className="flex flex-col gap-4">
          <ChoiceGroup
            name="stack"
            legend={t("interview.setup.stack")}
            hint={t("interview.setup.stackHint")}
            options={[
              ...stackOptions.map((option) => ({ value: option.slug, label: option.name })),
              { value: NO_STACK, label: t("interview.setup.noStack") },
            ]}
            error={errors.stack?.message}
            inputProps={register("stack", { required })}
          />
          {chosenStack === NO_STACK && (
            <Field
              id="tellUs"
              label={t("interview.setup.tellUs")}
              hint={t("interview.setup.tellUsHint")}
            >
              {(describedBy) => (
                <Controller
                  control={control}
                  name="tellUs"
                  render={({ field }) => (
                    <TagInput
                      id="tellUs"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={t("interview.setup.tellUsPlaceholder")}
                      maxItems={PROFILE_LIMITS.technologiesMaxItems}
                      maxLength={PROFILE_LIMITS.technologyMaxLength}
                      describedBy={describedBy}
                    />
                  )}
                />
              )}
            </Field>
          )}
        </div>
      )}

      {supported.length > 0 && (
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={errors.types ? "types-error" : undefined}
        >
          <legend className="mb-1 font-bold text-heading">{t("interview.setup.types")}</legend>
          <p className="-mt-1 mb-1 text-base text-muted-foreground">
            {t("interview.setup.typesHint")}
          </p>
          <div className="grid gap-2">
            {supported.map((type) => (
              <CheckboxCard
                key={type}
                value={type}
                title={t(`interview.types.${type}.label`)}
                description={t(`interview.types.${type}.description`)}
                aria-invalid={errors.types ? true : undefined}
                aria-errormessage={errors.types ? "types-error" : undefined}
                {...register("types", {
                  validate: (value: QuestionType[]) =>
                    value.length > 0 || t("interview.setup.typesRequired"),
                })}
              />
            ))}
          </div>
          <FieldError id="types-error" message={errors.types?.message} />
        </fieldset>
      )}

      <div className="flex flex-col gap-3 border-t border-frame pt-6">
        <h2 className="text-xl leading-tight">{t("interview.setup.scopeTitle")}</h2>
        <Note as="p">{t("interview.setup.scope")}</Note>
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting}
        className="w-full sm:w-auto sm:self-start"
      >
        {isSubmitting ? t("interview.setup.starting") : t("interview.setup.start")}
      </Button>
    </form>
  );
}
