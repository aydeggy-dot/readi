/** A page's title and its one line of context, at one size across the app (ADR-0013). */
export function PageHeading({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[1.9rem] leading-tight sm:text-4xl">{title}</h1>
      {lead && <p className="text-lg text-muted-foreground">{lead}</p>}
    </div>
  );
}
