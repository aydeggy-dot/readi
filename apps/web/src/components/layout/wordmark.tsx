import Link from "next/link";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * The Readi wordmark (ADR-0013): "Readi" in Alegreya 500 with the dot of the i replaced by the
 * mentor's pen tick — the "yes, that's right" a teacher leaves in the margin.
 *
 * It is typographic, not an image: a dotless ı (U+0131, which is why the trimmed subset keeps it)
 * and a tick drawn inline, so the mark costs no request and follows the text's own size.
 *
 * `tone` says what it sits on: "nav" on the structural grey bar (tick in --nav-accent, 3.34:1 on
 * the bar), "paper" on the page (tick in --pen, 3.56:1 on white). The letters themselves are never
 * the orange: #F97316 and its neighbours are too light to carry a word on white.
 */
export function Wordmark({
  href,
  tone = "nav",
  className,
}: {
  href: string;
  tone?: "nav" | "paper";
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={t("nav.wordmark")}
      className={cn(
        "font-serif text-[1.9rem] leading-none tracking-[-0.01em]",
        tone === "nav" ? "text-nav-foreground" : "text-heading",
        className,
      )}
    >
      {/* Hidden from assistive technology: the link carries the name, and "Readı" does not read. */}
      <span aria-hidden>
        Read
        <span className="relative inline-block">
          ı
          <svg
            viewBox="0 0 12 10"
            className={cn(
              "absolute -top-[0.1em] left-1/2 w-[0.5em] -translate-x-[40%]",
              tone === "nav" ? "text-nav-accent" : "text-pen",
            )}
            aria-hidden
          >
            <path
              d="M1.5 5.5 4.5 8.5 10.5 1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
    </Link>
  );
}
