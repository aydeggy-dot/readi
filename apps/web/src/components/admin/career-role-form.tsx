"use client";

import type {
  CareerLevelListItem,
  CareerRole,
  CareerRoleInput,
  QuestionType,
  StackListItem,
} from "@readi/shared-types";
import { invalidFields } from "@readi/api-client";
import { CONTENT_LIMITS, QUESTION_TYPES } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { StatusBadge } from "@/components/admin/badges";
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
import { orderedForRole } from "@/lib/catalogue-order";

/** Wire field name → the form control that holds it, for a validation 400's field paths. */
const FIELD_OF: Record<string, keyof Values | undefined> = {
  slug: "slug",
  name: "name",
  summary: "summary",
  position: "position",
  supported_question_types: "questionTypes",
  levels: "levels",
  stacks: "stacks",
};

interface Values {
  slug: string;
  name: string;
  summary: string;
  position: string;
  /** Checkbox groups: the ids that are ticked. */
  questionTypes: QuestionType[];
  levels: string[];
  stacks: string[];
  /** At most one stack id — the one the candidate's picker starts on. */
  defaultStack: string;
}

/**
 * A role, and what it offers (ADR-0015).
 *
 * Its levels and stacks are part of the role rather than rows with a life of their own, so they
 * are edited here and saved with it — the shape a track's topics already use. Two things follow
 * from the order being the content:
 *
 * - the lists are drawn **in the role's own order**, what it already offers first, so the form
 *   reads the way the candidate's picker will;
 * - a newly ticked level or stack joins the end rather than jumping to wherever the catalogue
 *   happens to list it, so opening a seeded role and saving it does not quietly reshuffle what
 *   candidates see.
 */
export function CareerRoleForm({
  role,
  levels,
  stacks,
  readOnly = false,
}: {
  role: CareerRole | null;
  /** The whole catalogue to choose from, drafts included: a role may be built before they go out. */
  levels: CareerLevelListItem[];
  stacks: StackListItem[];
  /** Published, and the reader is not an admin (ADR-0014 decision 7). */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [failure, setFailure] = useState<ApiFailure>();
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      slug: role?.slug ?? "",
      name: role?.name ?? "",
      summary: role?.summary ?? "",
      position: String(role?.position ?? 0),
      questionTypes: role?.supported_question_types ?? ["technical", "scenario", "behavioral"],
      levels: role?.levels ?? [],
      stacks: role?.stacks.map((link) => link.stack_id) ?? [],
      defaultStack: role?.stacks.find((link) => link.is_default)?.stack_id ?? "",
    },
  });
  const required = t("common.errors.required");

  // Drawn in the order they will be offered in, which is also the order they are saved in.
  const levelRows = orderedForRole(levels, role?.levels ?? []);
  const stackRows = orderedForRole(
    stacks,
    (role?.stacks ?? []).map((link) => link.stack_id),
  );

  const onSubmit = handleSubmit(async (values) => {
    setFailure(undefined);
    setSaved(false);
    const body: CareerRoleInput = {
      slug: values.slug.trim(),
      name: values.name.trim(),
      summary: values.summary.trim() || null,
      position: Number(values.position) || 0,
      supported_question_types: QUESTION_TYPES.filter((type) =>
        values.questionTypes.includes(type),
      ),
      levels: levelRows.filter((row) => values.levels.includes(row.id)).map((row) => row.id),
      stacks: stackRows
        .filter((row) => values.stacks.includes(row.id))
        .map((row) => ({ stack_id: row.id, is_default: row.id === values.defaultStack })),
    };
    try {
      const { data, error, response } = role
        ? await browserApi.PUT("/api/admin/content/career-roles/{id}", {
            params: { path: { id: role.id } },
            body,
          })
        : await browserApi.POST("/api/admin/content/career-roles", { body });
      if (!data) {
        /*
         * A validation 400 lists the field paths that failed, and the form marks them rather than
         * showing one unattached "Check this field" above thirty inputs (ADR-0012, CLAUDE.md §6).
         * The slug pattern and the catalogue caps are enforced by the contract alone, so this is
         * the usual way this form fails.
         */
        if (response.status === 400) {
          const marked = invalidFields(error)
            .map((field) => FIELD_OF[field])
            .filter((field): field is keyof Values => field !== undefined);
          for (const field of marked) setError(field, { message: t("common.errors.invalidField") });
          if (marked.length > 0) return;
        }
        const message = contentErrorMessage(error);
        setFailure(
          message
            ? { message, signedOut: false }
            : apiFailure(response.status, { 400: t("common.errors.invalidField") }),
        );
        return;
      }
      if (!role) {
        router.push(`/admin/content/roles/${data.id}`);
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
            id="name"
            label={t("admin.content.role.name")}
            hint={t("admin.content.role.nameHint")}
            error={errors.name?.message}
          >
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
          <Field id="slug" label={t("admin.content.role.slug")} error={errors.slug?.message}>
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

        <Field
          id="summary"
          label={t("admin.content.role.summary")}
          hint={t("admin.content.role.summaryHint")}
        >
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

        <Field
          id="position"
          label={t("admin.content.role.position")}
          hint={t("admin.content.role.positionHint")}
        >
          {(describedBy) => (
            <Input
              id="position"
              type="number"
              inputMode="numeric"
              min={0}
              max={999}
              className="sm:max-w-40"
              aria-describedby={describedBy}
              {...register("position")}
            />
          )}
        </Field>

        <fieldset className="flex flex-col gap-3 border-t border-frame pt-6">
          <legend className="font-bold text-heading">
            {t("admin.content.role.questionTypes")}
          </legend>
          <p className="-mt-1 text-base text-muted-foreground">
            {t("admin.content.role.questionTypesHint")}
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {QUESTION_TYPES.map((type) => (
              <li key={type}>
                <label className="flex min-h-11 items-center gap-2 text-base">
                  <input
                    type="checkbox"
                    value={type}
                    className="size-4 accent-primary"
                    {...register("questionTypes")}
                  />
                  {t(`admin.content.question.types.${type}`)}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <fieldset className="flex flex-col gap-3 border-t border-frame pt-6">
          <legend className="font-bold text-heading">{t("admin.content.role.levels")}</legend>
          <p className="-mt-1 text-base text-muted-foreground">
            {t("admin.content.role.levelsHint")}
          </p>
          {levelRows.length === 0 ? (
            <p className="text-base text-muted-foreground">{t("admin.content.role.noLevels")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {levelRows.map((level) => (
                <li key={level.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                  <label className="flex min-h-11 flex-1 items-center gap-2 text-base">
                    <input
                      type="checkbox"
                      value={level.id}
                      className="size-4 accent-primary"
                      {...register("levels")}
                    />
                    {level.name}
                  </label>
                  <Unpublished status={level.status} />
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-3 border-t border-frame pt-6">
          <legend className="font-bold text-heading">{t("admin.content.role.stacks")}</legend>
          <p className="-mt-1 text-base text-muted-foreground">
            {t("admin.content.role.stacksHint")}
          </p>
          {stackRows.length === 0 ? (
            <p className="text-base text-muted-foreground">{t("admin.content.role.noStacks")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {/*
                No default is a legitimate state — the candidate then has to choose — and a native
                radio cannot be unchecked, so without this row an editor who ticked one Default
                could never take it back (M2.5 review, 2026-09-22).
              */}
              <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <label className="flex min-h-11 flex-1 items-center gap-2 text-base text-muted-foreground">
                  <input
                    type="radio"
                    value=""
                    className="size-4 accent-primary"
                    {...register("defaultStack")}
                  />
                  {t("admin.content.role.noDefault")}
                </label>
              </li>
              {stackRows.map((stack) => (
                <li key={stack.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                  <label className="flex min-h-11 flex-1 items-center gap-2 text-base">
                    <input
                      type="checkbox"
                      value={stack.id}
                      className="size-4 accent-primary"
                      {...register("stacks")}
                    />
                    {stack.name}
                  </label>
                  <Unpublished status={stack.status} />
                  {/*
                    A radio group, not a second checkbox: only one stack can be the default, and a
                    radio is the control that says so before the API has to.
                  */}
                  <label className="flex min-h-11 items-center gap-2 text-base text-muted-foreground">
                    <input
                      type="radio"
                      value={stack.id}
                      className="size-4 accent-primary"
                      aria-label={`${t("admin.content.role.default")}: ${stack.name}`}
                      {...register("defaultStack")}
                    />
                    {t("admin.content.role.default")}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <div className="flex flex-col gap-3">
          <Button type="submit" disabled={isSubmitting} className="self-start">
            {isSubmitting
              ? t("common.saving")
              : role
                ? t("admin.content.actions.save")
                : t("admin.content.actions.create")}
          </Button>
          {saved && <Alert variant="success">{t("admin.content.actions.saved")}</Alert>}
        </div>
      </fieldset>
    </form>
  );
}

/** Says when a choice would not reach candidates yet, where the choice is made. */
function Unpublished({ status }: { status: CareerLevelListItem["status"] }) {
  if (status === "published") return null;
  return <StatusBadge status={status} />;
}
