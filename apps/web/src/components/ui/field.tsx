import type * as React from "react";
import { cn } from "@/lib/utils";

/** A labelled form control with an optional hint and error, wired up for screen readers. */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  /** Receives the ids to put on the control's aria-describedby. */
  children: (describedBy: string | undefined) => React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="font-bold text-heading">
        {label}
      </label>
      {/* Hint before the control, so it is read (and seen) before typing. */}
      {hint && (
        <p id={hintId} className="-mt-1 text-base text-muted-foreground">
          {hint}
        </p>
      )}
      {children(describedBy)}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-base text-destructive">
      {message}
    </p>
  );
}
