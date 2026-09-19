import type * as React from "react";
import { cn } from "@/lib/utils";
import { FieldError } from "./field";

/** A radio group rendered as full-width tappable cards (native inputs: accessible, no JS needed). */
export function ChoiceGroup<T extends string>({
  name,
  legend,
  options,
  error,
  columns = 1,
  inputProps,
}: {
  name: string;
  legend: string;
  options: readonly { value: T; label: string }[];
  error?: string;
  columns?: 1 | 2;
  /** Props for every radio input, e.g. react-hook-form's register(name). */
  inputProps: Omit<React.ComponentProps<"input">, "type" | "value">;
}) {
  const errorId = error ? `${name}-error` : undefined;
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={errorId}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2")}>
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-base transition-colors",
              "has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50",
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
