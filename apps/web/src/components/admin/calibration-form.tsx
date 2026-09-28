"use client";

import type { CalibrationAnswer } from "@readi/shared-types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Note } from "@/components/ui/margin";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure, networkFailure } from "@/lib/api-errors";
import { browserApi } from "@/lib/browser-api";

/**
 * The reviewer's marks for one answer.
 *
 * react-hook-form and no Zod in the browser (ADR-0012). The rubric's five descriptors are the whole
 * point of the form, so each criterion shows all of them as the radio labels rather than a bare 0–4:
 * a reviewer picking a rung should be reading the rung's own words, which is also what makes "rung 3
 * and rung 4 cannot be told apart" a thing they can tell us in the note.
 */
export function CalibrationScoreForm({ answer }: { answer: CalibrationAnswer }) {
  const router = useRouter();
  const [failure, setFailure] = useState<ApiFailure>();
  const [saved, setSaved] = useState(false);
  const existing = answer.my_score;

  interface Values {
    scores: Record<string, string>;
    reasons: Record<string, string>;
    note: string;
  }

  const { register, handleSubmit, formState } = useForm<Values>({
    defaultValues: {
      scores: Object.fromEntries(
        answer.criteria.map((criterion) => [
          String(criterion.position),
          String(
            existing?.criteria.find((entry) => entry.criterion === criterion.position)?.score ?? "",
          ),
        ]),
      ),
      reasons: Object.fromEntries(
        answer.criteria.map((criterion) => [
          String(criterion.position),
          existing?.criteria.find((entry) => entry.criterion === criterion.position)?.reasoning ??
            "",
        ]),
      ),
      note: existing?.note ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(undefined);
    setSaved(false);
    const criteria = answer.criteria.map((criterion) => {
      const key = String(criterion.position);
      const reasoning = values.reasons[key]?.trim();
      return {
        criterion: criterion.position,
        score: Number(values.scores[key]),
        evidence: [],
        reasoning: reasoning ? reasoning : null,
      };
    });
    if (criteria.some((entry) => Number.isNaN(entry.score))) {
      setFailure({ message: t("admin.calibration.answer.pickEvery"), signedOut: false });
      return;
    }
    try {
      const { data, error, response } = await browserApi.POST(
        "/api/admin/calibration/answers/{id}/score",
        {
          params: { path: { id: answer.id } },
          body: { criteria, note: values.note.trim() ? values.note.trim() : null },
        },
      );
      if (!data) {
        setFailure(
          apiFailure(response.status, {
            400: t("admin.calibration.errors.criteriaMismatch"),
            404: t("admin.calibration.errors.gone"),
          }),
        );
        void error;
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setFailure(networkFailure());
    }
  });

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      className="flex flex-col gap-6 border-t border-frame pt-6"
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-xl leading-tight">{t("admin.calibration.answer.yourMarks")}</h2>
        <Note as="aside">{t("admin.calibration.answer.blindNote")}</Note>
      </div>

      {failure && <ErrorAlert failure={failure} />}

      {answer.criteria.map((criterion) => (
        <fieldset key={criterion.position} className="flex flex-col gap-3">
          <legend className="flex flex-col gap-1">
            <span className="text-lg font-bold text-heading">{criterion.dimension}</span>
            <span className="text-base text-muted-foreground">
              {criterion.description} ·{" "}
              {t("admin.calibration.answer.weight", { weight: criterion.weight })}
            </span>
          </legend>
          <div className="flex flex-col gap-2">
            {Object.keys(criterion.levels)
              .sort()
              .map((rung) => (
                <label
                  key={rung}
                  className="flex items-start gap-3 rounded border border-frame p-3 text-base"
                >
                  <input
                    type="radio"
                    value={rung}
                    className="mt-1 size-5 shrink-0 accent-[var(--nav-accent)]"
                    {...register(`scores.${criterion.position}` as const)}
                  />
                  <span>
                    <span className="font-bold tabular-nums">{rung}</span>{" "}
                    <span>{criterion.levels[rung]}</span>
                  </span>
                </label>
              ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-base text-muted-foreground">
              {t("admin.calibration.answer.why")}
            </span>
            <Textarea
              rows={2}
              {...register(`reasons.${criterion.position}` as const)}
              placeholder={t("admin.calibration.answer.whyPlaceholder")}
            />
          </label>
        </fieldset>
      ))}

      <label className="flex flex-col gap-1.5">
        <span className="text-lg font-bold text-heading">{t("admin.calibration.answer.note")}</span>
        <span className="text-base text-muted-foreground">
          {t("admin.calibration.answer.noteHint")}
        </span>
        <Textarea rows={4} {...register("note")} />
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={formState.isSubmitting} className="self-start">
          {formState.isSubmitting
            ? t("common.saving")
            : existing
              ? t("admin.calibration.actions.update")
              : t("admin.calibration.actions.save")}
        </Button>
        {saved && <Alert variant="success">{t("admin.calibration.actions.saved")}</Alert>}
        {existing && !saved && (
          <p className="text-base text-muted-foreground">
            {t("admin.calibration.answer.alreadyScored")}
          </p>
        )}
      </div>
    </form>
  );
}
