import type * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        // --input (#6B7280, 4.83:1) not --border: a field's edge carries meaning, so it needs 3:1
        // (WCAG 2.2 §1.4.11). At or above 16px so iOS Safari does not zoom into a focused field.
        "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-[1.0625rem] transition-colors",
        "placeholder:text-muted-foreground",
        "disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
