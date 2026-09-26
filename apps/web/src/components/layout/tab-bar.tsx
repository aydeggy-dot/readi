"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isCurrentPath } from "@/lib/navigation";

/**
 * The phone tab bar (D1's deferred piece, built in M3 because M3 creates the third destination).
 *
 * D1 left it out with a reason: "no screen today has three destinations". Home, Practice and Profile
 * is three, and on a phone a bar of three taps at the bottom beats three links crowded into the
 * header beside the wordmark and Log out.
 *
 * It is the same structural grey as the header and the same visual language as `NavLink` — the page
 * you are on is `aria-current="page"`, bold, and marked in the pen's orange, so it is never colour
 * alone (ADR-0013). Inside `data-nav-surface`, because the page's own focus ring is 1.46:1 on this
 * grey. Labels rather than icons: the identity is typographic, and an icon set is bytes on a
 * connection we are trying to spend nothing on.
 *
 * Phone only (`sm:hidden`). Above `sm` the header's own links have room, and the interview screen's
 * route group has no tab bar at all — mid-interview there is nowhere else to be.
 */
export function TabBar({
  label,
  items,
}: {
  label: string;
  items: readonly { href: string; label: string; exact?: boolean }[];
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      data-nav-surface
      className="fixed inset-x-0 bottom-0 z-20 bg-nav sm:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const current = isCurrentPath(pathname, item.href, { exact: item.exact });
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-2 text-base font-bold",
                  current ? "text-nav-foreground" : "text-nav-muted",
                )}
              >
                {/* The mark is above the label, where a tab bar's indicator is looked for. */}
                <span
                  aria-hidden
                  className={cn(
                    "h-0.5 w-8 rounded-full",
                    current ? "bg-nav-accent" : "bg-transparent",
                  )}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
