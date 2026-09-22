"use client";

import type { Lesson, LessonInput, Topic } from "@readi/shared-types";
import { CONTENT_LIMITS } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { MarkdownField } from "@/components/admin/markdown-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Note } from "@/components/ui/margin";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import { contentErrorMessage } from "@/lib/content-errors";

interface Values {
  slug: string;
  title: string;
  body: string;
  topic_id: string;
  position: string;
  estimated_minutes: string;
}

/**
 * A lesson: a title, a markdown body and its place in a module. Creating one needs a module, so a
 * new lesson starts from its track; this form then edits it for the rest of its life.
 */
export function LessonForm({
  lesson,
  moduleId,
  topics,
  readOnly = false,
}: {
  lesson: Lesson | null;
  /** Where a new lesson goes. Ignored when editing: a lesson does not move between modules here. */
  moduleId?: string;
  topics: Topic[];
  /** Published, and the reader is not an admin (ADR-0014 decision 7). */
  readOnly?: boolean;
}) {
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
      slug: lesson?.slug ?? "",
      title: lesson?.title ?? "",
      body: lesson?.body ?? "",
      topic_id: lesson?.topic_id ?? "",
      position: String(lesson?.position ?? 0),
      estimated_minutes: lesson?.estimated_minutes ? String(lesson.estimated_minutes) : "",
    },
  });
  const body = useWatch({ control, name: "body" });
  const required = t("common.errors.required");

  const onSubmit = handleSubmit(async (values) => {
    setFailure(undefined);
    setSaved(false);
    const payload: LessonInput = {
      slug: values.slug.trim(),
      title: values.title.trim(),
      body: values.body.trim(),
      topic_id: values.topic_id || null,
      position: Number(values.position) || 0,
      estimated_minutes: values.estimated_minutes ? Number(values.estimated_minutes) : null,
    };
    try {
      const { data, error, response } = lesson
        ? await browserApi.PUT("/api/admin/content/lessons/{id}", {
            params: { path: { id: lesson.id } },
            body: payload,
          })
        : await browserApi.POST("/api/admin/content/modules/{id}/lessons", {
            params: { path: { id: moduleId ?? "" } },
            body: payload,
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
      if (!lesson) {
        router.push(`/admin/content/lessons/${data.id}`);
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
          <Field id="title" label={t("admin.content.lesson.title")} error={errors.title?.message}>
            {(describedBy) => (
              <Input
                id="title"
                maxLength={CONTENT_LIMITS.titleMaxLength}
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.title)}
                {...register("title", { validate: (value) => value.trim().length > 0 || required })}
              />
            )}
          </Field>
          <Field id="slug" label={t("admin.content.lesson.slug")} error={errors.slug?.message}>
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

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="topic_id" label={t("admin.content.lesson.topic")}>
            {(describedBy) => (
              <Select id="topic_id" aria-describedby={describedBy} {...register("topic_id")}>
                <option value="">{t("admin.content.lesson.noTopic")}</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            id="position"
            label={t("admin.content.lesson.position")}
            hint={t("admin.content.lesson.positionHint")}
          >
            {(describedBy) => (
              <Input
                id="position"
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                aria-describedby={describedBy}
                {...register("position")}
              />
            )}
          </Field>
          <Field id="estimated_minutes" label={t("admin.content.lesson.minutes")}>
            {(describedBy) => (
              <Input
                id="estimated_minutes"
                type="number"
                inputMode="numeric"
                min={1}
                max={CONTENT_LIMITS.lessonMinutesMax}
                aria-describedby={describedBy}
                {...register("estimated_minutes")}
              />
            )}
          </Field>
        </div>

        <MarkdownField
          id="body"
          label={t("admin.content.lesson.body")}
          error={errors.body?.message}
          value={body}
          rows={14}
          maxLength={CONTENT_LIMITS.lessonBodyMaxLength}
          textareaProps={register("body", {
            validate: (value) => value.trim().length > 0 || required,
          })}
        />

        <div className="flex flex-col gap-3">
          <Button type="submit" disabled={isSubmitting} className="self-start">
            {isSubmitting
              ? t("common.saving")
              : lesson
                ? t("admin.content.actions.save")
                : t("admin.content.actions.create")}
          </Button>
          {saved && <Alert variant="success">{t("admin.content.actions.saved")}</Alert>}
        </div>
      </fieldset>
    </form>
  );
}
