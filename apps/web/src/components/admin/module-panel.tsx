"use client";

import type { Module, ModuleInput, Topic, Track } from "@readi/shared-types";
import { CONTENT_LIMITS } from "@readi/shared-types/constants";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { SeedBadge, StatusBadge } from "@/components/admin/badges";
import { LessonForm } from "@/components/admin/lesson-form";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import { contentErrorMessage } from "@/lib/content-errors";

interface Values {
  slug: string;
  title: string;
  summary: string;
  position: string;
}

/**
 * A track's modules and the lessons inside them. A module is structural: it has no status of its
 * own and no history of its own — editing one versions its track (ADR-0014 decisions 1 and 2) —
 * so it is edited here rather than on a page of its own.
 */
export function ModulePanel({ track, topics }: { track: Track; topics: Topic[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [addingLessonTo, setAddingLessonTo] = useState<string | null>(null);
  const [addingModule, setAddingModule] = useState(false);

  return (
    <section className="flex flex-col gap-4 border-t border-frame pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl leading-tight">{t("admin.content.track.modules")}</h2>
        <p className="text-base text-muted-foreground">{t("admin.content.track.modulesHint")}</p>
      </div>

      {track.modules.length === 0 && (
        <p className="text-base text-muted-foreground">{t("admin.content.track.noModules")}</p>
      )}

      <ul className="flex flex-col gap-4">
        {track.modules.map((module) => (
          <li key={module.id} className="flex flex-col gap-3 rounded-md border border-border p-4">
            {editing === module.id ? (
              <ModuleForm
                trackId={track.id}
                module={module}
                onDone={() => setEditing(null)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-xl leading-tight">{module.title}</h3>
                  <span className="text-base text-muted-foreground">{module.slug}</span>
                  <SeedBadge seedManaged={module.seed_managed} />
                </div>
                {module.summary && <p className="text-base">{module.summary}</p>}
                <ul className="divide-y divide-border">
                  {module.lessons.length === 0 && (
                    <li className="py-2 text-base text-muted-foreground">
                      {t("admin.content.track.noLessons")}
                    </li>
                  )}
                  {module.lessons.map((lesson) => (
                    <li
                      key={lesson.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                    >
                      <Link
                        href={`/admin/content/lessons/${lesson.id}`}
                        className="font-bold underline decoration-pen decoration-2 underline-offset-4"
                      >
                        {lesson.title}
                      </Link>
                      <StatusBadge status={lesson.status} />
                      <SeedBadge seedManaged={lesson.seed_managed} />
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(module.id)}
                  >
                    {t("admin.content.track.editModule")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setAddingLessonTo(addingLessonTo === module.id ? null : module.id)
                    }
                  >
                    {t("admin.content.actions.newLesson")}
                  </Button>
                </div>
                {addingLessonTo === module.id && (
                  <div className="border-t border-border pt-4">
                    <LessonForm lesson={null} moduleId={module.id} topics={topics} />
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {addingModule ? (
        <div className="rounded-md border border-border p-4">
          <ModuleForm
            trackId={track.id}
            position={track.modules.length}
            onDone={() => setAddingModule(false)}
            onCancel={() => setAddingModule(false)}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => setAddingModule(true)}
        >
          {t("admin.content.actions.newModule")}
        </Button>
      )}
    </section>
  );
}

function ModuleForm({
  trackId,
  module,
  position = 0,
  onDone,
  onCancel,
}: {
  trackId: string;
  module?: Module;
  position?: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [failure, setFailure] = useState<ApiFailure>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      slug: module?.slug ?? "",
      title: module?.title ?? "",
      summary: module?.summary ?? "",
      position: String(module?.position ?? position),
    },
  });
  const required = t("common.errors.required");
  const prefix = module?.id ?? "new-module";

  const onSubmit = handleSubmit(async (values) => {
    setFailure(undefined);
    const body: ModuleInput = {
      slug: values.slug.trim(),
      title: values.title.trim(),
      summary: values.summary.trim() || null,
      position: Number(values.position) || 0,
    };
    try {
      const { error, response } = module
        ? await browserApi.PUT("/api/admin/content/modules/{id}", {
            params: { path: { id: module.id } },
            body,
          })
        : await browserApi.POST("/api/admin/content/tracks/{id}/modules", {
            params: { path: { id: trackId } },
            body,
          });
      if (!response.ok) {
        const message = contentErrorMessage(error);
        setFailure(
          message
            ? { message, signedOut: false }
            : apiFailure(response.status, { 400: t("common.errors.invalidField") }),
        );
        return;
      }
    } catch {
      setFailure(networkFailure());
      return;
    }
    onDone();
    router.refresh();
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      {failure && <ErrorAlert failure={failure} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_7rem]">
        <Field
          id={`${prefix}-title`}
          label={t("admin.content.track.moduleTitle")}
          error={errors.title?.message}
        >
          {(describedBy) => (
            <Input
              id={`${prefix}-title`}
              maxLength={CONTENT_LIMITS.titleMaxLength}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.title)}
              {...register("title", { validate: (value) => value.trim().length > 0 || required })}
            />
          )}
        </Field>
        <Field
          id={`${prefix}-slug`}
          label={t("admin.content.track.moduleSlug")}
          error={errors.slug?.message}
        >
          {(describedBy) => (
            <Input
              id={`${prefix}-slug`}
              maxLength={CONTENT_LIMITS.slugMaxLength}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.slug)}
              {...register("slug", { validate: (value) => value.trim().length > 0 || required })}
            />
          )}
        </Field>
        <Field id={`${prefix}-position`} label={t("admin.content.track.modulePosition")}>
          {(describedBy) => (
            <Input
              id={`${prefix}-position`}
              type="number"
              inputMode="numeric"
              min={0}
              max={999}
              aria-describedby={describedBy}
              {...register("position")}
            />
          )}
        </Field>
      </div>
      <Field id={`${prefix}-summary`} label={t("admin.content.track.moduleSummary")}>
        {(describedBy) => (
          <Textarea
            id={`${prefix}-summary`}
            rows={2}
            maxLength={CONTENT_LIMITS.summaryMaxLength}
            aria-describedby={describedBy}
            {...register("summary")}
          />
        )}
      </Field>
      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("common.saving") : t("admin.content.track.saveModule")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
