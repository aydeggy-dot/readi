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
import { useEffect, useState } from "react";
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
  /** `criterion` is a string because a `<select>`'s value is; it is the criterion's position. */
  planned_follow_ups: { criterion: string; probe: string }[];
}

/**
 * The dimensions of the rubric currently selected, so that a planned follow-up can name the
 * criterion it probes in words rather than as a number (ADR-0015-era CMS: staff screens, not
 * reading). The question's own rubric arrives with the page; changing the rubric in the form
 * fetches the new one, because the list endpoint carries counts rather than criteria.
 *
 * Empty while a rubric is unchosen or in flight, and the form falls back to "Criterion N" — a
 * follow-up still has to be editable when the fetch fails.
 */
function useRubricCriteria(rubricId: string, question: Question | null): string[] {
  const initial = question?.rubric_id === rubricId ? (question?.rubric.criteria ?? []) : [];
  const [criteria, setCriteria] = useState<string[]>(initial.map((c) => c.dimension));
  const [loadedFor, setLoadedFor] = useState(initial.length > 0 ? rubricId : "");

  useEffect(() => {
    if (!rubricId || rubricId === loadedFor) return;
    let current = true;
    void (async () => {
      try {
        const { data } = await browserApi.GET("/api/admin/content/rubrics/{id}", {
          params: { path: { id: rubricId } },
        });
        if (!current) return;
        setCriteria((data?.criteria ?? []).map((criterion) => criterion.dimension));
        setLoadedFor(rubricId);
      } catch {
        if (current) setCriteria([]);
      }
    })();
    return () => {
      current = false;
    };
  }, [rubricId, loadedFor]);

  return criteria;
}

/**
 * The criterion choices. A rubric has at most `rubricCriteria.max` criteria, and the form may be
 * open on a question whose rubric has not loaded — so the list is the dimensions where they are
 * known and numbered placeholders where they are not, rather than nothing to choose from.
 */
function criterionOptions(criteria: readonly string[]): { value: string; label: string }[] {
  const count = criteria.length > 0 ? criteria.length : CONTENT_LIMITS.rubricCriteria.max;
  return Array.from({ length: count }, (_, index) => ({
    value: String(index),
    label: criteria[index] ?? t("admin.content.question.criterionNumber", { number: index + 1 }),
  }));
}

/**
 * The first criterion nothing probes yet. A criterion may carry two probes, but the second is the
 * deliberate case — a criterion that scores two separable things — so the default is a fresh one.
 */
function nextCriterion(fields: readonly { criterion: string }[]): string {
  const taken = new Set(fields.map((field) => field.criterion));
  for (let index = 0; index < CONTENT_LIMITS.rubricCriteria.max; index += 1) {
    if (!taken.has(String(index))) return String(index);
  }
  return "0";
}

/** Whether any criterion has more probes than the API will take. */
function overCap(fields: readonly { criterion: string }[]): boolean {
  const counted = new Map<string, number>();
  for (const field of fields) {
    counted.set(field.criterion, (counted.get(field.criterion) ?? 0) + 1);
  }
  return [...counted.values()].some((count) => count > CONTENT_LIMITS.followUpsPerCriterion);
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
      planned_follow_ups: (question?.planned_follow_ups ?? []).map((plan) => ({
        criterion: String(plan.criterion),
        probe: plan.probe,
      })),
    },
  });
  const idealPoints = useFieldArray({ control, name: "ideal_points" });
  const followUps = useFieldArray({ control, name: "planned_follow_ups" });
  const prompt = useWatch({ control, name: "prompt" });
  const context = useWatch({ control, name: "context" });
  const rubricId = useWatch({ control, name: "rubric_id" });
  const criteria = useRubricCriteria(rubricId, question);
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
    planned_follow_ups: values.planned_follow_ups
      .filter((plan) => plan.probe.trim().length > 0)
      .map((plan) => ({ criterion: Number(plan.criterion), probe: plan.probe.trim() })),
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
          name="roles"
          legend={t("admin.content.question.roles")}
          hint={t("admin.content.question.rolesHint")}
          options={roles}
          empty={t("admin.content.catalogue.noRoles")}
          error={errors.roles?.message}
          inputProps={register("roles", { validate: (value) => value.length > 0 || required })}
        />

        <CatalogueChecks
          name="levels"
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
          name="stacks"
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

        {/*
         * Planned follow-ups (owner's decision, 2026-09-23). Answer key, like the ideal points
         * above and for the same reason: they tell a candidate what they are about to be asked
         * next. The criterion is stored as a position, so the select shows the rubric's own
         * dimensions where it has them and "Criterion N" where it does not.
         */}
        <fieldset className="flex flex-col gap-3">
          <legend className="font-bold text-heading">
            {t("admin.content.question.followUps")}
          </legend>
          <p className="-mt-1 text-base text-muted-foreground">
            {t("admin.content.question.followUpsHint")}
          </p>
          {!rubricId && (
            <p className="text-base text-muted-foreground">
              {t("admin.content.question.followUpsNeedRubric")}
            </p>
          )}
          {followUps.fields.map((item, index) => (
            <div key={item.id} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <Select
                className="sm:w-56"
                aria-label={t("admin.content.question.followUpCriterion")}
                {...register(`planned_follow_ups.${index}.criterion`)}
              >
                {criterionOptions(criteria).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Input
                aria-label={t("admin.content.question.followUpProbe", { number: index + 1 })}
                placeholder={t("admin.content.question.followUpProbePlaceholder")}
                maxLength={CONTENT_LIMITS.followUpProbeMaxLength}
                {...register(`planned_follow_ups.${index}.probe`)}
              />
              <Button
                type="button"
                variant="ghost"
                aria-label={t("admin.content.question.removeFollowUp", { number: index + 1 })}
                onClick={() => followUps.remove(index)}
              >
                <span aria-hidden>×</span>
              </Button>
            </div>
          ))}
          {/*
           * A criterion may carry two probes and never three, which the API refuses. Saying so here
           * is cheaper than a 400 the editor has to work out for themselves.
           */}
          {overCap(followUps.fields) && (
            <Alert variant="error">
              {t("admin.content.question.followUpsOverCap", {
                max: CONTENT_LIMITS.followUpsPerCriterion,
              })}
            </Alert>
          )}
          {followUps.fields.length < CONTENT_LIMITS.plannedFollowUps && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                followUps.append({ criterion: nextCriterion(followUps.fields), probe: "" })
              }
            >
              {t("admin.content.question.addFollowUp")}
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
  name,
  legend,
  hint,
  options,
  empty,
  error,
  inputProps,
}: {
  /** Names the error text, so it is attached to the group rather than orphaned in the DOM. */
  name: string;
  legend: string;
  hint?: string;
  options: readonly CatalogueOption[];
  /** What to say when the catalogue has none of these yet. */
  empty: string;
  error?: string;
  inputProps: Omit<React.ComponentProps<"input">, "type" | "value">;
}) {
  const errorId = error ? `${name}-error` : undefined;
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={errorId}>
      <legend className="mb-1 font-bold text-heading">{legend}</legend>
      {hint && <p className="-mt-1 mb-1 text-base text-muted-foreground">{hint}</p>}
      {options.length === 0 ? (
        <p className="text-base text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-x-4">
          {options.map((option) => (
            <label key={option.slug} className="flex min-h-11 items-center gap-2 text-base">
              <input
                type="checkbox"
                value={option.slug}
                className="size-4 accent-primary"
                aria-invalid={error ? true : undefined}
                aria-errormessage={errorId}
                {...inputProps}
              />
              {option.name}
            </label>
          ))}
        </div>
      )}
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
