import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The Margin layout primitives (ADR-0013): a reading column with a margin beside it where the
 * mentor's notes sit, next to the words they comment on.
 *
 * On a phone there is no room for a second column, so the notes fall under the text they belong
 * to, each still marked by its pen rule — nothing is lost at 360 px, which is the width we design
 * for first. The two columns only appear at `lg`.
 */
export function Margined({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,38rem)_15rem]", className)}>
      {children}
    </div>
  );
}

/**
 * One of the mentor's notes: set in the serif, on a rail in the structural grey, and numbered when
 * it answers a highlighted phrase. The number is the same one the <Highlight> carries, so the two
 * are read as a pair.
 */
export function Note({
  mark,
  as: Component = "p",
  children,
  className,
}: {
  mark?: number;
  as?: "p" | "li" | "aside";
  children: ReactNode;
  className?: string;
}) {
  return (
    <Component
      className={cn(
        "border-l-2 border-frame pl-4 font-serif text-[1.0625rem] leading-snug text-heading",
        className,
      )}
    >
      {mark !== undefined && (
        <span className="font-sans text-sm font-bold text-primary">{mark} </span>
      )}
      {children}
    </Component>
  );
}

/**
 * The highlighter over a phrase the candidate said and the mentor is about to comment on. A real
 * <mark>, so it is announced as marked text, with the number that ties it to its note; the colour
 * alone is never the only sign of the pairing.
 *
 * `box-decoration-clone` keeps the highlight whole when the phrase wraps across lines, which on a
 * 360 px screen is most of the time.
 */
export function Highlight({
  mark,
  children,
  className,
}: {
  mark?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <mark
      className={cn(
        "box-decoration-clone rounded-[2px] bg-highlight px-0.5 text-foreground",
        className,
      )}
    >
      {children}
      {mark !== undefined && (
        <sup className="ml-0.5 font-sans text-xs font-bold text-primary">{mark}</sup>
      )}
    </mark>
  );
}
