"use client";

import { useEffect, useRef } from "react";
import { t } from "@/i18n";

/**
 * A snippet from a question's setup material.
 *
 * **The one horizontal scroller in the product**, because reflowing code destroys the shape a
 * candidate is being asked to read. That makes it the one place where content can be off screen
 * with nothing to say so — and a candidate who answers about the half of a snippet they could see
 * is answering a different question. So when it overflows it says so, three ways:
 *
 * - a line of text under it, which is the signal that does not depend on seeing anything;
 * - a fade at the right edge, which disappears once you have scrolled to the end;
 * - `tabIndex={0}` with a name, so a keyboard can scroll it at all (WCAG 2.1 §2.1.1: a scrollable
 *   region that cannot be focused cannot be read without a mouse).
 *
 * The measuring writes **attributes**, not React state: whether a box overflows is a fact about the
 * DOM, re-measured by a `ResizeObserver` when the viewport or the font changes, and pushing it
 * through a render would be a second copy of something the browser already knows.
 */
export function CodeBlock({ text }: { text: string }) {
  const pre = useRef<HTMLPreElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const code = pre.current;
    const wrapper = box.current;
    if (!code || !wrapper) return;

    const measure = () => {
      // A pixel of slack: sub-pixel widths make an exactly-fitting block look scrollable.
      const scrollable = code.scrollWidth - code.clientWidth > 1;
      const atEnd = code.scrollLeft + code.clientWidth >= code.scrollWidth - 1;
      // Two attributes rather than two conditions on one: a variant that has to beat another
      // variant depends on the order Tailwind emits them, which is not ours to rely on.
      wrapper.toggleAttribute("data-scrollable", scrollable);
      wrapper.toggleAttribute("data-fade", scrollable && !atEnd);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(code);
    code.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      code.removeEventListener("scroll", measure);
    };
  }, [text]);

  return (
    <div ref={box} className="group/code flex min-w-0 flex-col gap-2">
      <div className="relative min-w-0">
        <pre
          ref={pre}
          tabIndex={0}
          role="region"
          aria-label={t("interview.screen.snippet")}
          className="max-w-full overflow-x-auto rounded-sm border border-border bg-background p-3 font-mono text-base leading-relaxed"
        >
          <code>{text}</code>
        </pre>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-px right-px w-10 rounded-r-sm bg-gradient-to-l from-background to-transparent opacity-0 transition-opacity group-data-[fade]/code:opacity-100 motion-reduce:transition-none"
        />
      </div>
      {/* Hidden rather than dimmed when it does not apply, so a screen reader is not told to
          scroll a snippet that fits. */}
      <p className="hidden text-base text-muted-foreground group-data-[scrollable]/code:block">
        {t("interview.screen.snippetScroll")}
      </p>
    </div>
  );
}
