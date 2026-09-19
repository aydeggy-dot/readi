"use client";

import { PROFILE_LIMITS } from "@readi/shared-types/constants";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";

/** Free-text tags with one-tap suggestions. Enter or comma adds the typed item. */
export function StackInput({
  id,
  value,
  onChange,
  suggestions,
  invalid,
  describedBy,
}: {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  suggestions: readonly string[];
  invalid: boolean;
  describedBy?: string;
}) {
  const [draft, setDraft] = useState("");
  const has = (item: string) => value.some((v) => v.toLowerCase() === item.toLowerCase());
  const full = value.length >= PROFILE_LIMITS.stackMaxItems;

  function add(raw: string) {
    const item = raw.trim().slice(0, PROFILE_LIMITS.stackItemMaxLength);
    if (item && !has(item) && !full) onChange([...value, item]);
    setDraft("");
  }

  const remaining = suggestions.filter((s) => !has(s));

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((item) => (
            <li
              key={item}
              className="flex items-center gap-1 rounded-full border bg-accent py-1 pr-1 pl-3 text-sm"
            >
              {item}
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-full hover:bg-background"
                aria-label={t("profileForm.stackRemove", { item })}
                onClick={() => onChange(value.filter((v) => v !== item))}
              >
                <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          maxLength={PROFILE_LIMITS.stackItemMaxLength}
          placeholder={t("profileForm.stackPlaceholder")}
          disabled={full}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          enterKeyHint="done"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(draft);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={full || !draft.trim()}
          onClick={() => add(draft)}
        >
          {t("profileForm.stackAdd")}
        </Button>
      </div>
      {remaining.length > 0 && !full && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t("profileForm.stackSuggestions")}</p>
          <div className="flex flex-wrap gap-2">
            {remaining.map((item) => (
              <button
                key={item}
                type="button"
                className="min-h-9 rounded-full border border-dashed px-3 text-sm hover:bg-accent"
                onClick={() => add(item)}
              >
                + {item}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
