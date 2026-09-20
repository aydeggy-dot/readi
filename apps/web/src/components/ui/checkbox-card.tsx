import type * as React from "react";
import { cn } from "@/lib/utils";

/** A checkbox with a title and description, as one large tap target. */
export function CheckboxCard({
  title,
  description,
  note,
  className,
  ...inputProps
}: Omit<React.ComponentProps<"input">, "type"> & {
  title: string;
  description: string;
  note?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-md border border-input bg-background p-4 transition-colors hover:bg-accent",
        "has-checked:border-primary has-checked:bg-accent",
        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
        className,
      )}
    >
      <input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" {...inputProps} />
      <span className="flex flex-col gap-1">
        <span className="font-bold text-heading">{title}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
        {note && <span className="text-sm">{note}</span>}
      </span>
    </label>
  );
}
