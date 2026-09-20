import type { ReactNode } from "react";
import { Margined } from "@/components/ui/margin";

/**
 * A sign-in or sign-up screen: one reading column, and the margin beside it for notes about what
 * happens next (ADR-0013). `aside` is optional and should be specific — a note that says nothing
 * is worse than no note.
 */
export function AuthCard({
  title,
  subtitle,
  aside,
  children,
}: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Margined>
      <section className="flex max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[1.9rem] leading-tight sm:text-4xl">{title}</h1>
          {subtitle && <p className="text-lg text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </section>
      {aside && <div className="grid content-start gap-5 lg:pt-24">{aside}</div>}
    </Margined>
  );
}

export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-base text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
