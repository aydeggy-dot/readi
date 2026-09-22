import type * as React from "react";
import { cn } from "@/lib/utils";
import { FieldError } from "./field";

/** A radio group rendered as full-width tappable cards (native inputs: accessible, no JS needed). */
export function ChoiceGroup<T extends string>({
  name,
  legend,
  hint,
  options,
  error,
  columns = 1,
  inputProps,
}: {
  name: string;
  legend: string;
  /** One line under the legend, for a choice whose consequence is not obvious from its label. */
  hint?: string;
  options: readonly { value: T; label: string }[];
  error?: string;
  columns?: 1 | 2;
  /** Props for every radio input, e.g. react-hook-form's register(name). */
  inputProps: Omit<React.ComponentProps<"input">, "type" | "value">;
}) {
  const errorId = error ? `${name}-error` : undefined;
  const hintId = hint ? `${name}-hint` : undefined;
  // Both, in reading order, so a screen reader hears what the group is for before what is wrong.
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={describedBy}>
      <legend className="mb-2 font-bold text-heading">{legend}</legend>
      {hint && (
        <p id={hintId} className="-mt-1 mb-1 text-base text-muted-foreground">
          {hint}
        </p>
      )}
      <div className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2")}>
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-input bg-background px-4 py-3 font-bold text-heading transition-colors hover:bg-accent",
              "has-checked:border-primary has-checked:bg-accent",
              "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
            )}
          >
            <input
              type="radio"
              value={option.value}
              className="size-4 accent-primary"
              {...inputProps}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
