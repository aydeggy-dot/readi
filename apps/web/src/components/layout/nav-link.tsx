"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isCurrentPath } from "@/lib/navigation";

/**
 * A link on the structural grey bar. The page you are on is marked `aria-current="page"` and
 * underlined in the pen's orange — announced by screen readers and visible without colour alone
 * (ADR-0013). Client-side only because the current path is a browser fact; the label itself is
 * still translated on the server and passed in as children, so no copy reaches the bundle.
 */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const current = isCurrentPath(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "rounded-sm px-2 py-1 font-bold underline-offset-8 transition-colors",
        current
          ? "text-nav-foreground underline decoration-nav-accent decoration-2"
          : "text-nav-muted hover:text-nav-foreground",
      )}
    >
      {children}
    </Link>
  );
}
