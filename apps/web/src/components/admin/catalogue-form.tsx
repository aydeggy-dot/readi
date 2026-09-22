"use client";

import type { CareerLevel, CareerLevelInput, Stack, StackInput } from "@readi/shared-types";
import { CATALOGUE_LIMITS, CONTENT_LIMITS } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/margin";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import { contentErrorMessage } from "@/lib/content-errors";

interface Values {
  slug: string;
  name: string;
  summary: string;
  /** A number input's value is a string until it is sent. Levels only. */
  rank: string;
}

/**
 * A career level or a stack: the two halves of the catalogue that are nothing but a name
 * (ADR-0015). One component rather than two files of the same fields — they differ by one input
 * and one endpoint, and a level and a stack drifting apart would be an accident, not a decision.
 *
 * A role, which has choices to make, has its own editor.
 */
export function CatalogueForm({
  kind,
  entry,
  readOnly = false,
}: {
  kind: "career-levels" | "stacks";
  entry: CareerLevel | Stack | null;
  /** Published, and the reader is not an admin (ADR-0014 decision 7). */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [failure, setFailure] = useState<ApiFailure>();
  const [saved, setSaved] = useState(false);
  const isLevel = kind === "career-levels";
  const listHref = isLevel ? "/admin/content/levels" : "/admin/content/stacks";
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      slug: entry?.slug ?? "",
      name: entry?.name ?? "",
      summary: entry?.summary ?? "",
      rank: String(entry && "rank" in entry ? entry.rank : 10),
    },
  });
  const required = t("common.errors.required");

  const onSubmit = handleSubmit(async (values) => {
    setFailure(undefined);
    setSaved(false);
    const common = {
      slug: values.slug.trim(),
      name: values.name.trim(),
      summary: values.summary.trim() || null,
    };
    try {
      const { data, error, response } = await save(kind, entry?.id, {
        ...common,
        rank: Number(values.rank) || 0,
      });
      if (!data) {
        const message = contentErrorMessage(error);
        setFailure(
          message
            ? { message, signedOut: false }
            : apiFailure(response.status, { 400: t("common.errors.invalidField") }),
        );
        return;
      }
      if (!entry) {
        router.push(`${listHref}/${data.id}`);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setFailure(networkFailure());
    }
  });

  const labels = isLevel
    ? {
        name: t("admin.content.level.name"),
        slug: t("admin.content.level.slug"),
        summary: t("admin.content.level.summary"),
        summaryHint: t("admin.content.level.summaryHint"),
        nameHint: undefined,
      }
    : {
        name: t("admin.content.stack.name"),
        slug: t("admin.content.stack.slug"),
        summary: t("admin.content.stack.summary"),
        summaryHint: t("admin.content.stack.summaryHint"),
        nameHint: t("admin.content.stack.nameHint"),
      };

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      {readOnly && <Note as="aside">{t("admin.content.actions.publishedReadOnly")}</Note>}
      <fieldset disabled={readOnly} className="flex flex-col gap-6">
        {failure && <ErrorAlert failure={failure} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label={labels.name} hint={labels.nameHint} error={errors.name?.message}>
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
          <Field id="slug" label={labels.slug} error={errors.slug?.message}>
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

        <Field id="summary" label={labels.summary} hint={labels.summaryHint}>
          {(describedBy) => (
            <Textarea
              id="summary"
              rows={2}
              maxLength={CONTENT_LIMITS.summaryMaxLength}
              aria-describedby={describedBy}
              {...register("summary")}
            />
          )}
        </Field>

        {isLevel && (
          <Field
            id="rank"
            label={t("admin.content.level.rank")}
            hint={t("admin.content.level.rankHint")}
          >
            {(describedBy) => (
              <Input
                id="rank"
                type="number"
                inputMode="numeric"
                min={0}
                max={CATALOGUE_LIMITS.levelRankMax}
                className="sm:max-w-40"
                aria-describedby={describedBy}
                {...register("rank")}
              />
            )}
          </Field>
        )}

        <div className="flex flex-col gap-3">
          <Button type="submit" disabled={isSubmitting} className="self-start">
            {isSubmitting
              ? t("common.saving")
              : entry
                ? t("admin.content.actions.save")
                : t("admin.content.actions.create")}
          </Button>
          {saved && <Alert variant="success">{t("admin.content.actions.saved")}</Alert>}
        </div>
      </fieldset>
    </form>
  );
}

/**
 * The four calls, written out. openapi-fetch resolves a path to its request and response types at
 * the call site, so the path has to be a literal — a variable would erase exactly the checking
 * that makes the generated client worth having (ADR-0012).
 */
function save(
  kind: "career-levels" | "stacks",
  id: string | undefined,
  body: CareerLevelInput & StackInput,
) {
  if (kind === "career-levels") {
    return id
      ? browserApi.PUT("/api/admin/content/career-levels/{id}", {
          params: { path: { id } },
          body,
        })
      : browserApi.POST("/api/admin/content/career-levels", { body });
  }
  const stack: StackInput = { slug: body.slug, name: body.name, summary: body.summary };
  return id
    ? browserApi.PUT("/api/admin/content/stacks/{id}", { params: { path: { id } }, body: stack })
    : browserApi.POST("/api/admin/content/stacks", { body: stack });
}
