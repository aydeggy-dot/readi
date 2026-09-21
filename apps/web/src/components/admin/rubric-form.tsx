"use client";

import type { Rubric, RubricInput } from "@readi/shared-types";
import { CONTENT_LIMITS, RUBRIC_LEVELS, RUBRIC_WEIGHT_TOTAL } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import { contentErrorMessage } from "@/lib/content-errors";
import { cn } from "@/lib/utils";

type Levels = Record<(typeof RUBRIC_LEVELS)[number], string>;

interface Values {
  slug: string;
  name: string;
  criteria: {
    dimension: string;
    description: string;
    /** A number input's value is a string until it is sent. */
    weight: string;
    levels: Levels;
  }[];
}

const emptyLevels = (): Levels => ({ "0": "", "1": "", "2": "", "3": "", "4": "" });

const emptyCriterion = () => ({
  dimension: "",
  description: "",
  weight: "",
  levels: emptyLevels(),
});

/**
 * The rubric editor: the most consequential screen in the CMS. These criteria and their five
 * descriptors are what the evaluator scores an answer against (spec §6.2), so vague wording here
 * becomes vague, unfair feedback for a candidate.
 *
 * The running weight total is shown rather than corrected: weights that do not add up to 100 are
 * fine in a draft and are refused at publish (ADR-0014 decision 1), which is the point at which
 * the number has to be right.
 */
export function RubricForm({ rubric }: { rubric: Rubric | null }) {
  const router = useRouter();
  const [failure, setFailure] = useState<ApiFailure>();
  const [saved, setSaved] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      slug: rubric?.slug ?? "",
      name: rubric?.name ?? "",
      criteria: rubric
        ? rubric.criteria.map((criterion) => ({
            dimension: criterion.dimension,
            description: criterion.description,
            weight: String(criterion.weight),
            levels: criterion.levels,
          }))
        : [emptyCriterion(), emptyCriterion()],
    },
  });
  const criteria = useFieldArray({ control, name: "criteria" });
  const watched = useWatch({ control, name: "criteria" });
  const total = (watched ?? []).reduce(
    (sum, criterion) => sum + (Number(criterion.weight) || 0),
    0,
  );
  const required = t("common.errors.required");

  const onSubmit = handleSubmit(async (values) => {
    setFailure(undefined);
    setSaved(false);
    const body: RubricInput = {
      slug: values.slug.trim(),
      name: values.name.trim(),
      criteria: values.criteria.map((criterion) => ({
        dimension: criterion.dimension.trim(),
        description: criterion.description.trim(),
        weight: Number(criterion.weight),
        levels: criterion.levels,
      })),
    };
    try {
      const { data, error, response } = rubric
        ? await browserApi.PUT("/api/admin/content/rubrics/{id}", {
            params: { path: { id: rubric.id } },
            body,
          })
        : await browserApi.POST("/api/admin/content/rubrics", { body });
      if (!data) {
        const message = contentErrorMessage(error);
        setFailure(
          message
            ? { message, signedOut: false }
            : apiFailure(response.status, {
                // The one 400 with a cause worth naming: the weights do not total 100.
                400: t("admin.content.errors.weights"),
              }),
        );
        return;
      }
      if (!rubric) {
        router.push(`/admin/content/rubrics/${data.id}`);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setFailure(networkFailure());
    }
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-6">
      {failure && <ErrorAlert failure={failure} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label={t("admin.content.rubric.name")} error={errors.name?.message}>
          {(describedBy) => (
            <Input
              id="name"
              maxLength={CONTENT_LIMITS.titleMaxLength}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.name)}
              {...register("name", { validate: (value) => value.trim().length > 0 || required })}
            />
          )}
        </Field>
        <Field id="slug" label={t("admin.content.rubric.slug")} error={errors.slug?.message}>
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
      </div>

      <section className="flex flex-col gap-4 border-t border-frame pt-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl leading-tight">{t("admin.content.rubric.criteria")}</h2>
          <p className="text-base text-muted-foreground">
            {t("admin.content.rubric.criteriaHint")}
          </p>
          <p
            data-testid="weight-total"
            className={cn(
              "text-base font-bold",
              total === RUBRIC_WEIGHT_TOTAL ? "text-success" : "text-muted-foreground",
            )}
          >
            {total === RUBRIC_WEIGHT_TOTAL
              ? t("admin.content.rubric.weightOk")
              : t("admin.content.rubric.weightTotal", { total })}
          </p>
        </div>

        {criteria.fields.map((item, index) => (
          <fieldset
            key={item.id}
            className="flex flex-col gap-4 rounded-md border border-border p-4"
          >
            <legend className="px-1 font-bold text-heading">
              {t("admin.content.rubric.criterion", { number: index + 1 })}
            </legend>
            <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
              <Field
                id={`criterion-${index}-dimension`}
                label={t("admin.content.rubric.dimension")}
                error={errors.criteria?.[index]?.dimension?.message}
              >
                {(describedBy) => (
                  <Input
                    id={`criterion-${index}-dimension`}
                    maxLength={CONTENT_LIMITS.dimensionMaxLength}
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(errors.criteria?.[index]?.dimension)}
                    {...register(`criteria.${index}.dimension`, {
                      validate: (value) => value.trim().length > 0 || required,
                    })}
                  />
                )}
              </Field>
              <Field
                id={`criterion-${index}-weight`}
                label={t("admin.content.rubric.weight")}
                error={errors.criteria?.[index]?.weight?.message}
              >
                {(describedBy) => (
                  <Input
                    id={`criterion-${index}-weight`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={RUBRIC_WEIGHT_TOTAL}
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(errors.criteria?.[index]?.weight)}
                    {...register(`criteria.${index}.weight`, {
                      validate: (value) => Number(value) > 0 || required,
                    })}
                  />
                )}
              </Field>
            </div>
            <Field
              id={`criterion-${index}-description`}
              label={t("admin.content.rubric.criterionDescription")}
              error={errors.criteria?.[index]?.description?.message}
            >
              {(describedBy) => (
                <Textarea
                  id={`criterion-${index}-description`}
                  rows={2}
                  maxLength={CONTENT_LIMITS.criterionDescriptionMaxLength}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(errors.criteria?.[index]?.description)}
                  {...register(`criteria.${index}.description`, {
                    validate: (value) => value.trim().length > 0 || required,
                  })}
                />
              )}
            </Field>
            <div className="flex flex-col gap-3">
              <p className="font-bold text-heading">{t("admin.content.rubric.levels")}</p>
              <p className="-mt-2 text-base text-muted-foreground">
                {t("admin.content.rubric.levelsHint")}
              </p>
              {RUBRIC_LEVELS.map((level) => (
                <Field
                  key={level}
                  id={`criterion-${index}-level-${level}`}
                  label={t("admin.content.rubric.level", { level })}
                  error={errors.criteria?.[index]?.levels?.[level]?.message}
                >
                  {(describedBy) => (
                    <Textarea
                      id={`criterion-${index}-level-${level}`}
                      rows={2}
                      className="field-sizing-content min-h-0"
                      maxLength={CONTENT_LIMITS.levelDescriptorMaxLength}
                      aria-describedby={describedBy}
                      aria-invalid={Boolean(errors.criteria?.[index]?.levels?.[level])}
                      {...register(`criteria.${index}.levels.${level}`, {
                        validate: (value) => value.trim().length > 0 || required,
                      })}
                    />
                  )}
                </Field>
              ))}
            </div>
            {criteria.fields.length > CONTENT_LIMITS.rubricCriteria.min && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => criteria.remove(index)}
              >
                {t("admin.content.rubric.removeCriterion", { number: index + 1 })}
              </Button>
            )}
          </fieldset>
        ))}

        {criteria.fields.length < CONTENT_LIMITS.rubricCriteria.max && (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => criteria.append(emptyCriterion())}
          >
            {t("admin.content.rubric.addCriterion")}
          </Button>
        )}
      </section>

      <div className="flex flex-col gap-3">
        <Button type="submit" disabled={isSubmitting} className="self-start">
          {isSubmitting
            ? t("common.saving")
            : rubric
              ? t("admin.content.actions.save")
              : t("admin.content.actions.create")}
        </Button>
        {saved && <Alert variant="success">{t("admin.content.actions.saved")}</Alert>}
      </div>
    </form>
  );
}
