"use client";

import type {
  DuplicateMatch,
  Question,
  QuestionInput,
  QuestionType,
  RubricListItem,
  Topic,
} from "@readi/shared-types";
import { invalidFields } from "@readi/api-client";
import { CONTENT_LIMITS, DIFFICULTY_RANGE, QUESTION_TYPES } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import type * as React from "react";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { DuplicateWarnings } from "@/components/admin/duplicate-warnings";
import { MarkdownField } from "@/components/admin/markdown-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Note } from "@/components/ui/margin";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import type { CatalogueOption } from "@/lib/catalogue-choices";
import { contentErrorMessage } from "@/lib/content-errors";

interface Values {
  slug: string;
  type: QuestionType;
  /** Catalogue slugs (ADR-0015), which is what the question stores. */
  roles: string[];
  levels: string[];
  /** Empty means general to the role, which is what most questions are (ADR-0015). */
  stacks: string[];
  topic_id: string;
  subtopic: string;
  difficulty: string;
  prompt: string;
  context: string;
  rubric_id: string;
  /** A field array needs objects, so each ideal point is `{ value }`. */
  ideal_points: { value: string }[];
}

const DIFFICULTIES = Array.from(
  { length: DIFFICULTY_RANGE.max - DIFFICULTY_RANGE.min + 1 },
  (_, index) => DIFFICULTY_RANGE.min + index,
);

/**
 * Writing a question and its answer key (spec §6.1). Everything on this form except the prompt and
 * the setup is invisible to candidates — the ideal points especially, which are what the evaluator
 * scores against (ADR-0014 decision 3).
 *
 * Near-duplicates can be checked before saving: the endpoint takes the text rather than an id, so
 * the warning arrives while the question is still being written, which is when it is useful.
 */
export function QuestionForm({
  question,
  topics,
  rubrics,
  roles,
  levels,
  stacks,
  readOnly = false,
}: {
  question: Question | null;
  topics: Topic[];
  rubrics: RubricListItem[];
  /** The catalogue to tag against, drafts included: a question is written before its role goes out. */
  roles: readonly CatalogueOption[];
  levels: readonly CatalogueOption[];
  stacks: readonly CatalogueOption[];
  /** Published, and the reader is not an admin: the words are theirs to read, not to change. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [failure, setFailure] = useState<ApiFailure>();
  const [saved, setSaved] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [checking, setChecking] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      slug: question?.slug ?? "",
      type: question?.type ?? "technical",
      roles: question?.roles ?? [],
      levels: question?.levels ?? [],
      stacks: question?.stacks ?? [],
      topic_id: question?.topic_id ?? "",
      subtopic: question?.subtopic ?? "",
      difficulty: String(question?.difficulty ?? 3),
      prompt: question?.prompt ?? "",
      context: question?.context ?? "",
      rubric_id: question?.rubric_id ?? "",
      ideal_points: (question?.ideal_points ?? [""]).map((value) => ({ value })),
    },
  });
  const idealPoints = useFieldArray({ control, name: "ideal_points" });
  const prompt = useWatch({ control, name: "prompt" });
  const context = useWatch({ control, name: "context" });
  const required = t("common.errors.required");

  const body = (values: Values): QuestionInput => ({
    slug: values.slug.trim(),
    type: values.type,
    roles: values.roles,
    levels: values.levels,
    stacks: values.stacks,
    topic_id: values.topic_id,
    subtopic: values.subtopic.trim() || null,
    difficulty: Number(values.difficulty),
    prompt: values.prompt.trim(),
    context: values.context.trim() || null,
    rubric_id: values.rubric_id,
    ideal_points: values.ideal_points.map((point) => point.value.trim()).filter(Boolean),
  });

  const checkDuplicates = async () => {
    setChecking(true);
    setFailure(undefined);
    try {
      const { data, response } = await browserApi.POST(
        "/api/admin/content/questions/duplicate-check",
        {
          body: {
            prompt: prompt.trim(),
            context: context.trim() || null,
            exclude_question_id: question?.id ?? null,
          },
        },
      );
      if (!data) {
        setFailure({ message: t("admin.content.duplicates.unavailable"), signedOut: false });
        if (response.status === 401) setFailure(apiFailure(401));
        return;
      }
      setDuplicates(data.matches);
    } catch {
      setFailure(networkFailure());
    } finally {
      setChecking(false);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setFailure(undefined);
    setSaved(false);
    const payload = body(values);
    try {
      const { data, error, response } = question
        ? await browserApi.PUT("/api/admin/content/questions/{id}", {
            params: { path: { id: question.id } },
            body: payload,
          })
        : await browserApi.POST("/api/admin/content/questions", { body: payload });
      if (!data) {
        if (response.status === 400) {
          const fields = invalidFields(error);
          for (const field of fields) {
            if (field in payload) {
              setError(field as keyof Values, { message: t("common.errors.invalidField") });
            }
          }
          if (fields.length > 0) return;
        }
        const message = contentErrorMessage(error);
        setFailure(message ? { message, signedOut: false } : apiFailure(response.status));
        return;
      }
      if (!question) {
        router.push(`/admin/content/questions/${data.id}`);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setFailure(networkFailure());
    }
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      {readOnly && <Note as="aside">{t("admin.content.actions.publishedReadOnly")}</Note>}
      <fieldset disabled={readOnly} className="flex flex-col gap-6">
        {failure && <ErrorAlert failure={failure} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="slug"
            label={t("admin.content.question.slug")}
            hint={t("admin.content.question.slugHint")}
            error={errors.slug?.message}
          >
            {(describedBy) => (
              <Input
                id="slug"
                maxLength={CONTENT_LIMITS.slugMaxLength}
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.slug)}
                {...register("slug", { validate: (value) => value.trim().length > 0 || required })}
              />
            )}
          </Field>
          <Field id="type" label={t("admin.content.question.type")}>
            {(describedBy) => (
              <Select id="type" aria-describedby={describedBy} {...register("type")}>
                {QUESTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`admin.content.question.types.${type}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <CatalogueChecks
          legend={t("admin.content.question.roles")}
          hint={t("admin.content.question.rolesHint")}
          options={roles}
          empty={t("admin.content.catalogue.noRoles")}
          error={errors.roles?.message}
          inputProps={register("roles", { validate: (value) => value.length > 0 || required })}
        />

        <CatalogueChecks
          legend={t("admin.content.question.levels")}
          options={levels}
          empty={t("admin.content.catalogue.noLevels")}
          error={errors.levels?.message}
          inputProps={register("levels", { validate: (value) => value.length > 0 || required })}
        />

        {/*
          Stacks, and the only one of the three that may be left empty — that is what it means:
          no tags, so the question is general to its role and everyone preparing for it is asked
          it (ADR-0015). Tagging narrows the audience, so the hint says so before the tick.
        */}
        <CatalogueChecks
          legend={t("admin.content.question.stacks")}
          hint={t("admin.content.question.stacksHint")}
          options={stacks}
          empty={t("admin.content.catalogue.noStacks")}
          error={errors.stacks?.message}
          inputProps={register("stacks")}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            id="topic_id"
            label={t("admin.content.question.topic")}
            error={errors.topic_id?.message}
          >
            {(describedBy) => (
              <Select
                id="topic_id"
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.topic_id)}
                {...register("topic_id", { required })}
              >
                <option value="">{t("common.notSet")}</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            id="subtopic"
            label={t("admin.content.question.subtopic")}
            hint={t("admin.content.question.subtopicHint")}
          >
            {(describedBy) => (
              <Input
                id="subtopic"
                maxLength={CONTENT_LIMITS.subtopicMaxLength}
                aria-describedby={describedBy}
                {...register("subtopic")}
              />
            )}
          </Field>
          <Field
            id="difficulty"
            label={t("admin.content.question.difficulty")}
            hint={t("admin.content.question.difficultyHint")}
          >
            {(describedBy) => (
              <Select id="difficulty" aria-describedby={describedBy} {...register("difficulty")}>
                {DIFFICULTIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <MarkdownField
          id="prompt"
          label={t("admin.content.question.prompt")}
          hint={t("admin.content.question.promptHint")}
          error={errors.prompt?.message}
          value={prompt}
          maxLength={CONTENT_LIMITS.questionPromptMaxLength}
          textareaProps={register("prompt", {
            validate: (value) => value.trim().length > 0 || required,
          })}
        />

        <MarkdownField
          id="context"
          label={t("admin.content.question.context")}
          hint={t("admin.content.question.contextHint")}
          value={context}
          rows={4}
          maxLength={CONTENT_LIMITS.questionContextMaxLength}
          textareaProps={register("context")}
        />

        <Field
          id="rubric_id"
          label={t("admin.content.question.rubric")}
          hint={t("admin.content.question.rubricHint")}
          error={errors.rubric_id?.message}
        >
          {(describedBy) => (
            <Select
              id="rubric_id"
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.rubric_id)}
              {...register("rubric_id", { required })}
            >
              <option value="">{t("common.notSet")}</option>
              {rubrics.map((rubric) => (
                <option key={rubric.id} value={rubric.id}>
                  {rubric.name} — {t(`admin.content.status.${rubric.status}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="font-bold text-heading">
            {t("admin.content.question.idealPoints")}
          </legend>
          <p className="-mt-1 text-base text-muted-foreground">
            {t("admin.content.question.idealPointsHint")}
          </p>
          {idealPoints.fields.map((item, index) => (
            <div key={item.id} className="flex items-start gap-2">
              <Input
                aria-label={`${t("admin.content.question.idealPoints")} ${index + 1}`}
                maxLength={CONTENT_LIMITS.idealPointMaxLength}
                {...register(`ideal_points.${index}.value`)}
              />
              {idealPoints.fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={t("admin.content.question.removePoint", { number: index + 1 })}
                  onClick={() => idealPoints.remove(index)}
                >
                  <span aria-hidden>×</span>
                </Button>
              )}
            </div>
          ))}
          {idealPoints.fields.length < CONTENT_LIMITS.idealPoints && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => idealPoints.append({ value: "" })}
            >
              {t("admin.content.question.addPoint")}
            </Button>
          )}
        </fieldset>

        <div className="flex flex-col gap-3 border-t border-frame pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? t("common.saving")
                : question
                  ? t("admin.content.actions.save")
                  : t("admin.content.actions.create")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={checking || prompt.trim().length === 0}
              onClick={() => void checkDuplicates()}
            >
              {checking ? t("common.loading") : t("admin.content.duplicates.check")}
            </Button>
          </div>
          {saved && <Alert variant="success">{t("admin.content.actions.saved")}</Alert>}
          {duplicates?.length === 0 && (
            <p className="text-base text-muted-foreground">{t("admin.content.duplicates.none")}</p>
          )}
          {duplicates && duplicates.length > 0 && <DuplicateWarnings matches={duplicates} />}
        </div>
      </fieldset>
    </form>
  );
}

/**
 * One catalogue dimension as a row of checkboxes. Three of them differing only in their legend is
 * what this replaces — and the fourth would have been written by copying the third.
 */
function CatalogueChecks({
  legend,
  hint,
  options,
  empty,
  error,
  inputProps,
}: {
  legend: string;
  hint?: string;
  options: readonly CatalogueOption[];
  /** What to say when the catalogue has none of these yet. */
  empty: string;
  error?: string;
  inputProps: Omit<React.ComponentProps<"input">, "type" | "value">;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-bold text-heading">{legend}</legend>
      {hint && <p className="-mt-1 mb-1 text-base text-muted-foreground">{hint}</p>}
      {options.length === 0 ? (
        <p className="text-base text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {options.map((option) => (
            <label key={option.slug} className="flex items-center gap-2 text-base">
              <input
                type="checkbox"
                value={option.slug}
                className="size-4 accent-primary"
                {...inputProps}
              />
              {option.name}
            </label>
          ))}
        </div>
      )}
      <FieldError message={error} />
    </fieldset>
  );
}
