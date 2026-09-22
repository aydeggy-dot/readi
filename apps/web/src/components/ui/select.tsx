import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A native select, styled like `Input`. Native on purpose: it is the one control a phone renders
 * as its own picker, it needs no JavaScript, and the CMS's filter bar is mostly selects.
 */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        // --input (#6B7280) like every other field edge, and 16px+ so iOS does not zoom (ADR-0013).
        "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-[1.0625rem] transition-colors",
        "disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
