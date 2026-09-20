"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";

/** Free-text tags with optional one-tap suggestions. Enter or comma adds the typed item. */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  maxItems,
  maxLength,
  suggestions = [],
  invalid = false,
  describedBy,
}: {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  maxItems: number;
  maxLength: number;
  suggestions?: readonly string[];
  invalid?: boolean;
  describedBy?: string;
}) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string>();
  const has = (item: string) => value.some((v) => v.toLowerCase() === item.toLowerCase());
  const full = value.length >= maxItems;

  function add(raw: string) {
    const item = raw.trim().slice(0, maxLength);
    setDraft("");
    if (!item) return;
    // Silence here reads as a broken field: say which rule stopped the item going in.
    if (has(item)) return setNotice(t("profileForm.errors.stackDuplicate", { item }));
    if (full) return setNotice(t("profileForm.errors.stackMax", { max: maxItems }));
    setNotice(undefined);
    onChange([...value, item]);
  }

  const remaining = suggestions.filter((s) => !has(s));

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((item) => (
            <li
              key={item}
              className="flex min-w-0 items-center gap-1 rounded-md bg-secondary py-1 pr-1 pl-3 text-base font-bold text-secondary-foreground"
            >
              <span className="min-w-0 break-words">{item}</span>
              <button
                type="button"
                className="flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-background"
                aria-label={t("common.removeItem", { item })}
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
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          enterKeyHint="done"
          onChange={(event) => {
            setDraft(event.target.value);
            setNotice(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(draft);
            }
          }}
        />
        <Button type="button" variant="outline" disabled={!draft.trim()} onClick={() => add(draft)}>
          {t("common.add")}
        </Button>
      </div>
      {notice && (
        <p className="text-base text-muted-foreground" role="status">
          {notice}
        </p>
      )}
      {remaining.length > 0 && !full && (
        <div className="flex flex-col gap-2">
          <p className="text-base text-muted-foreground">{t("common.suggestions")}</p>
          <div className="flex flex-wrap gap-2">
            {remaining.map((item) => (
              <button
                key={item}
                type="button"
                className="min-h-9 rounded-md border border-dashed border-input px-3 text-base hover:bg-accent"
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
