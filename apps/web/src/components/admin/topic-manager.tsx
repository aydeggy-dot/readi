"use client";

import type { Topic } from "@readi/shared-types";
import { CONTENT_LIMITS } from "@readi/shared-types/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";
import { contentErrorMessage } from "@/lib/content-errors";

interface Values {
  slug: string;
  name: string;
  description: string;
}

/**
 * The topic taxonomy: small, curated, and edited in place. Topics have no status and no history —
 * they are the vocabulary the rest of the content hangs from, not content themselves (spec §4.2) —
 * so there is no workflow here, just a name and a line of explanation. They carry no
 * `seed_managed` badge either: `Topic` is the one admin shape the candidate responses also use
 * (ADR-0014), and a candidate has no use for the CMS's bookkeeping.
 */
export function TopicManager({ topics }: { topics: Topic[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 border-t border-frame pt-6">
        <h2 className="text-xl leading-tight">{t("admin.content.actions.newTopic")}</h2>
        <TopicForm
          key={topics.length}
          mode="create"
          onDone={() => setCreated(true)}
          onCancel={null}
        />
        {created && <Alert variant="success">{t("admin.content.topic.created")}</Alert>}
      </section>

      <ul className="divide-y divide-border border-t border-frame">
        {topics.map((topic) => (
          <li key={topic.id} className="flex flex-col gap-2 py-4">
            {editing === topic.id ? (
              <TopicForm
                mode="edit"
                topic={topic}
                onDone={() => setEditing(null)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-xl leading-tight">{topic.name}</h3>
                  <span className="text-base text-muted-foreground">{topic.slug}</span>
                </div>
                {topic.description && <p className="text-base">{topic.description}</p>}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => setEditing(topic.id)}
                >
                  {t("admin.content.topic.rename")}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopicForm({
  mode,
  topic,
  onDone,
  onCancel,
}: {
  mode: "create" | "edit";
  topic?: Topic;
  onDone: () => void;
  onCancel: (() => void) | null;
}) {
  const router = useRouter();
  const [failure, setFailure] = useState<ApiFailure>();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      slug: topic?.slug ?? "",
      name: topic?.name ?? "",
      description: topic?.description ?? "",
    },
  });
  const required = t("common.errors.required");
  const idPrefix = topic?.id ?? "new";

  const onSubmit = handleSubmit(async (values) => {
    setFailure(undefined);
    const body = {
      slug: values.slug.trim(),
      name: values.name.trim(),
      description: values.description.trim() || null,
    };
    try {
      const { error, response } = topic
        ? await browserApi.PUT("/api/admin/content/topics/{id}", {
            params: { path: { id: topic.id } },
            body,
          })
        : await browserApi.POST("/api/admin/content/topics", { body });
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
    if (mode === "create") reset({ slug: "", name: "", description: "" });
    onDone();
    router.refresh();
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      {failure && <ErrorAlert failure={failure} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${idPrefix}-name`}
          label={t("admin.content.topic.name")}
          error={errors.name?.message}
        >
          {(describedBy) => (
            <Input
              id={`${idPrefix}-name`}
              maxLength={CONTENT_LIMITS.titleMaxLength}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.name)}
              {...register("name", { validate: (value) => value.trim().length > 0 || required })}
            />
          )}
        </Field>
        <Field
          id={`${idPrefix}-slug`}
          label={t("admin.content.topic.slug")}
          error={errors.slug?.message}
        >
          {(describedBy) => (
            <Input
              id={`${idPrefix}-slug`}
              maxLength={CONTENT_LIMITS.slugMaxLength}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.slug)}
              {...register("slug", { validate: (value) => value.trim().length > 0 || required })}
            />
          )}
        </Field>
      </div>
      <Field
        id={`${idPrefix}-description`}
        label={t("admin.content.topic.description")}
        hint={t("admin.content.topic.descriptionHint")}
      >
        {(describedBy) => (
          <Input
            id={`${idPrefix}-description`}
            maxLength={CONTENT_LIMITS.summaryMaxLength}
            aria-describedby={describedBy}
            {...register("description")}
          />
        )}
      </Field>
      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? t("common.saving")
            : mode === "create"
              ? t("admin.content.actions.create")
              : t("admin.content.actions.save")}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
