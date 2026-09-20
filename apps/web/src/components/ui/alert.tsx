import type * as React from "react";
import { cn } from "@/lib/utils";

/** An inline message. Errors are announced immediately; other messages politely. */
export function Alert({
  variant = "info",
  className,
  children,
}: {
  variant?: "info" | "error" | "success";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        // Long unbreakable values (email addresses) appear in these; they must wrap, not overflow.
        "rounded-md border px-4 py-3 text-sm break-words",
        variant === "error" && "border-destructive/40 bg-destructive/5 text-destructive",
        variant === "success" && "border-success/40 bg-success/5 text-success",
        variant === "info" && "bg-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}
