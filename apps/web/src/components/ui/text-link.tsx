import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * A link inside running text, underlined in the mentor's pen (ADR-0013). Always underlined:
 * colour on its own is not a signal everyone can see.
 */
export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "font-bold text-heading underline decoration-pen decoration-2 underline-offset-4 hover:decoration-primary",
        className,
      )}
      {...props}
    />
  );
}
