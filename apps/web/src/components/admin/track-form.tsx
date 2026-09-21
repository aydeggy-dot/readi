"use client";

import type { ExperienceLevel, TargetRole, Topic, Track, TrackInput } from "@readi/shared-types";
import { CONTENT_LIMITS, EXPERIENCE_LEVELS, TARGET_ROLES } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import { contentErrorMessage } from "@/lib/content-errors";

interface Values {
  slug: string;
  title: string;
  summary: string;
  role: TargetRole;
  level: ExperienceLevel;
  /** Topic ids that are covered, and which of those are core. */
  topics: string[];
  core: string[];
}

/**
 * A track's own fields: what it is for, and which topics it covers. Its modules are edited beside
 * it on the same page — they have no status or history of their own, so they ride on the track
 * (ADR-0014 decisions 1 and 2).
 */
export function TrackForm({ track, topics }: { track: Track | null; topics: Topic[] }) {
  const router = useRouter();
  const [failure, setFailure] = useState<ApiFailure>();
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      slug: track?.slug ?? "",
      title: track?.title ?? "",
      summary: track?.summary ?? "",
      role: track?.role ?? "frontend",
      level: track?.level ?? "mid",
      topics: track?.topics.map((link) => link.topic_id) ?? [],
      core: track?.topics.filter((link) => link.is_core).map((link) => link.topic_id) ?? [],
    },
  });
  const required = t("common.errors.required");

  const onSubmit = handleSubmit(async (values) => {
    setFailure(undefined);
    setSaved(false);
    const body: TrackInput = {
      slug: values.slug.trim(),
      title: values.title.trim(),
      summary: values.summary.trim() || null,
      role: values.role,
      level: values.level,
      topics: values.topics.map((id) => ({ topic_id: id, is_core: values.core.includes(id) })),
    };
    try {
      const { data, error, response } = track
        ? await browserApi.PUT("/api/admin/content/tracks/{id}", {
            params: { path: { id: track.id } },
            body,
          })
        : await browserApi.POST("/api/admin/content/tracks", { body });
      if (!data) {
        const message = contentErrorMessage(error);
        setFailure(
          message
            ? { message, signedOut: false }
            : apiFailure(response.status, { 400: t("common.errors.invalidField") }),
        );
        return;
      }
      if (!track) {
        router.push(`/admin/content/tracks/${data.id}`);
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
        <Field id="title" label={t("admin.content.track.title")} error={errors.title?.message}>
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
        <Field id="slug" label={t("admin.content.track.slug")} error={errors.slug?.message}>
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

      <Field id="summary" label={t("admin.content.track.summary")}>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="role"
          label={t("admin.content.track.role")}
          hint={t("admin.content.track.roleLevelHint")}
        >
          {(describedBy) => (
            <Select id="role" aria-describedby={describedBy} {...register("role")}>
              {TARGET_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`targetRoles.${role}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="level" label={t("admin.content.track.level")}>
          {(describedBy) => (
            <Select id="level" aria-describedby={describedBy} {...register("level")}>
              {EXPERIENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t(`levels.${level}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-bold text-heading">{t("admin.content.track.topics")}</legend>
        <p className="-mt-1 text-base text-muted-foreground">
          {t("admin.content.track.topicsHint")}
        </p>
        <ul className="divide-y divide-border">
          {topics.map((topic) => (
            <li key={topic.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-2">
              <label className="flex flex-1 items-center gap-2 text-base">
                <input
                  type="checkbox"
                  value={topic.id}
                  className="size-4 accent-primary"
                  {...register("topics")}
                />
                {topic.name}
              </label>
              <label className="flex items-center gap-2 text-base text-muted-foreground">
                <input
                  type="checkbox"
                  value={topic.id}
                  className="size-4 accent-primary"
                  aria-label={`${t("admin.content.track.core")}: ${topic.name}`}
                  {...register("core")}
                />
                {t("admin.content.track.core")}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex flex-col gap-3">
        <Button type="submit" disabled={isSubmitting} className="self-start">
          {isSubmitting
            ? t("common.saving")
            : track
              ? t("admin.content.actions.save")
              : t("admin.content.actions.create")}
        </Button>
        {saved && <Alert variant="success">{t("admin.content.actions.saved")}</Alert>}
      </div>
    </form>
  );
}
