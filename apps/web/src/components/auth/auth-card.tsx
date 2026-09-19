import type * as React from "react";

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
