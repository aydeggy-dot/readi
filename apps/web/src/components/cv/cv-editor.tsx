"use client";

import type { CvResponse, ParsedCv } from "@readi/shared-types";
import { PARSED_CV_LIMITS as L } from "@readi/shared-types/constants";
import { useState } from "react";
import {
  type Control,
  Controller,
  type UseFormRegisterReturn,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

// Form values: nullable months as "" and gaps as objects (field arrays need objects).
interface Values {
  skills: string[];
  projects: { name: string; description: string; technologies: string[] }[];
  experience: {
    title: string;
    organisation: string;
    start: string;
    end: string;
    current: boolean;
    summary: string;
  }[];
  gaps: { value: string }[];
}

const EMPTY: ParsedCv = { skills: [], projects: [], experience: [], gaps: [] };

function toValues(cv: ParsedCv): Values {
  return {
    skills: cv.skills,
    projects: cv.projects,
    experience: cv.experience.map((e) => ({ ...e, start: e.start ?? "", end: e.end ?? "" })),
    gaps: cv.gaps.map((value) => ({ value })),
  };
}

function toParsed(values: Values): ParsedCv {
  return {
    skills: values.skills,
    projects: values.projects.map((p) => ({
      ...p,
      name: p.name.trim(),
      description: p.description.trim(),
    })),
    experience: values.experience.map((e) => ({
      title: e.title.trim(),
      organisation: e.organisation.trim(),
      summary: e.summary.trim(),
      current: e.current,
      start: e.start || null,
      end: e.current ? null : e.end || null,
    })),
    gaps: values.gaps.map((g) => g.value.trim()).filter(Boolean),
  };
}

/** Lets the candidate correct what was read from the CV (or enter it by hand). */
export function CvEditor({
  parsed,
  onSaved,
}: {
  parsed: ParsedCv | null;
  onSaved: (cv: CvResponse) => void;
}) {
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<ApiFailure>();
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: toValues(parsed ?? EMPTY) });
  const projects = useFieldArray({ control, name: "projects" });
  const experience = useFieldArray({ control, name: "experience" });
  const gaps = useFieldArray({ control, name: "gaps" });
  const required = t("common.errors.required");
  const month = {
    validate: (value: string) => !value || MONTH.test(value) || t("cv.fields.monthFormat"),
  };

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);
    setFailure(undefined);
    try {
      const { data, response } = await browserApi.PUT("/api/me/cv/parsed", {
        body: toParsed(values),
      });
      if (!data) {
        setFailure(apiFailure(response.status, { 400: t("common.errors.invalidField") }));
        return;
      }
      setSaved(true);
      onSaved(data);
    } catch {
      setFailure(networkFailure());
    }
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-6">
      <Field id="cv-skills" label={t("cv.fields.skills")}>
        {(describedBy) => (
          <Controller
            control={control}
            name="skills"
            render={({ field }) => (
              <TagInput
                id="cv-skills"
                value={field.value}
                onChange={field.onChange}
                placeholder={t("cv.fields.skillsPlaceholder")}
                maxItems={L.skills}
                maxLength={L.skillLength}
                describedBy={describedBy}
              />
            )}
          />
        )}
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">{t("cv.fields.experience")}</legend>
        {experience.fields.map((item, index) => {
          return (
            <div key={item.id} className="flex flex-col gap-3 rounded-md border p-3">
              <Field
                id={`exp-${index}-title`}
                label={t("cv.fields.role")}
                error={errors.experience?.[index]?.title?.message}
              >
                {(d) => (
                  <Input
                    id={`exp-${index}-title`}
                    maxLength={L.titleLength}
                    aria-describedby={d}
                    aria-invalid={Boolean(errors.experience?.[index]?.title)}
                    {...register(`experience.${index}.title`, {
                      validate: (v) => v.trim().length > 0 || required,
                    })}
                  />
                )}
              </Field>
              <Field id={`exp-${index}-org`} label={t("cv.fields.organisation")}>
                {(d) => (
                  <Input
                    id={`exp-${index}-org`}
                    maxLength={L.titleLength}
                    aria-describedby={d}
                    {...register(`experience.${index}.organisation`)}
                  />
                )}
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  id={`exp-${index}-start`}
                  label={t("cv.fields.start")}
                  error={errors.experience?.[index]?.start?.message}
                >
                  {(d) => (
                    <Input
                      id={`exp-${index}-start`}
                      type="month"
                      placeholder="YYYY-MM"
                      aria-describedby={d}
                      {...register(`experience.${index}.start`, month)}
                    />
                  )}
                </Field>
                <EndMonth
                  control={control}
                  index={index}
                  error={errors.experience?.[index]?.end?.message}
                  inputProps={register(`experience.${index}.end`, month)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  {...register(`experience.${index}.current`)}
                />
                {t("cv.fields.current")}
              </label>
              <Field id={`exp-${index}-summary`} label={t("cv.fields.summary")}>
                {(d) => (
                  <Textarea
                    id={`exp-${index}-summary`}
                    maxLength={L.textLength}
                    aria-describedby={d}
                    {...register(`experience.${index}.summary`)}
                  />
                )}
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => experience.remove(index)}
              >
                {t("cv.fields.removeExperience")}
              </Button>
            </div>
          );
        })}
        {experience.fields.length < L.experience && (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              experience.append({
                title: "",
                organisation: "",
                start: "",
                end: "",
                current: false,
                summary: "",
              })
            }
          >
            {t("cv.fields.addExperience")}
          </Button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">{t("cv.fields.projects")}</legend>
        {projects.fields.map((item, index) => (
          <div key={item.id} className="flex flex-col gap-3 rounded-md border p-3">
            <Field
              id={`prj-${index}-name`}
              label={t("cv.fields.projectName")}
              error={errors.projects?.[index]?.name?.message}
            >
              {(d) => (
                <Input
                  id={`prj-${index}-name`}
                  maxLength={L.titleLength}
                  aria-describedby={d}
                  aria-invalid={Boolean(errors.projects?.[index]?.name)}
                  {...register(`projects.${index}.name`, {
                    validate: (v) => v.trim().length > 0 || required,
                  })}
                />
              )}
            </Field>
            <Field id={`prj-${index}-description`} label={t("cv.fields.projectDescription")}>
              {(d) => (
                <Textarea
                  id={`prj-${index}-description`}
                  maxLength={L.textLength}
                  aria-describedby={d}
                  {...register(`projects.${index}.description`)}
                />
              )}
            </Field>
            <Field id={`prj-${index}-tech`} label={t("cv.fields.technologies")}>
              {(d) => (
                <Controller
                  control={control}
                  name={`projects.${index}.technologies`}
                  render={({ field }) => (
                    <TagInput
                      id={`prj-${index}-tech`}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={t("cv.fields.technologiesPlaceholder")}
                      maxItems={L.technologies}
                      maxLength={L.skillLength}
                      describedBy={d}
                    />
                  )}
                />
              )}
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => projects.remove(index)}
            >
              {t("cv.fields.removeProject")}
            </Button>
          </div>
        ))}
        {projects.fields.length < L.projects && (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => projects.append({ name: "", description: "", technologies: [] })}
          >
            {t("cv.fields.addProject")}
          </Button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t("cv.fields.gaps")}</legend>
        <p className="-mt-1 text-sm text-muted-foreground">{t("cv.fields.gapsHint")}</p>
        {gaps.fields.map((item, index) => (
          <div key={item.id} className="flex items-start gap-2">
            <Textarea
              aria-label={t("cv.fields.gaps")}
              rows={2}
              className="field-sizing-content min-h-0"
              maxLength={L.gapLength}
              {...register(`gaps.${index}.value`)}
            />
            <Button
              type="button"
              variant="ghost"
              aria-label={t("cv.fields.removeGap")}
              onClick={() => gaps.remove(index)}
            >
              <span aria-hidden>×</span>
            </Button>
          </div>
        ))}
        {gaps.fields.length < L.gaps && (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => gaps.append({ value: "" })}
          >
            {t("cv.fields.addGap")}
          </Button>
        )}
      </fieldset>

      {saved && <Alert variant="success">{t("cv.fields.saved")}</Alert>}
      {failure && <ErrorAlert failure={failure} />}
      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto sm:self-start">
        {isSubmitting ? t("common.saving") : t("cv.fields.save")}
      </Button>
    </form>
  );
}

/** The end month, disabled while "I work here now" is ticked. */
function EndMonth({
  control,
  index,
  error,
  inputProps,
}: {
  control: Control<Values>;
  index: number;
  error?: string;
  inputProps: UseFormRegisterReturn;
}) {
  const current = useWatch({ control, name: `experience.${index}.current` });
  const id = `exp-${index}-end`;
  return (
    <Field id={id} label={t("cv.fields.end")} error={error}>
      {(describedBy) => (
        <Input
          id={id}
          type="month"
          placeholder="YYYY-MM"
          disabled={current}
          aria-describedby={describedBy}
          {...inputProps}
        />
      )}
    </Field>
  );
}
