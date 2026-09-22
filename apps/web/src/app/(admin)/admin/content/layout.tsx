import type { ReactNode } from "react";
import { NavLink } from "@/components/layout/nav-link";
import { t } from "@/i18n";
import { requireContentEditor } from "@/lib/session";

/**
 * The catalogue (roles, levels, stacks) sits at the end: it is set up once and then rarely
 * touched, unlike the questions someone is writing today.
 */
const SECTIONS = [
  "questions",
  "rubrics",
  "lessons",
  "tracks",
  "topics",
  "roles",
  "levels",
  "stacks",
] as const;

/**
 * The CMS. A content expert and an admin both work here; who may *publish* is decided per
 * transition, not per route (ADR-0014 decision 1), so this only has to keep everyone else out.
 *
 * The section bar scrolls sideways rather than wrapping: eight items at 360px, in the order they
 * are worked on — questions first, because that is where most of the day goes.
 */
export default async function ContentLayout({ children }: { children: ReactNode }) {
  await requireContentEditor();
  return (
    <div className="flex flex-col gap-6">
      <div data-nav-surface className="-mx-5 overflow-x-auto bg-nav px-5 py-2 sm:-mx-8 sm:px-8">
        <nav
          aria-label={t("admin.content.title")}
          className="mx-auto flex w-max items-center gap-1 sm:gap-3"
        >
          <NavLink href="/admin/content" exact>
            {t("admin.content.title")}
          </NavLink>
          {SECTIONS.map((section) => (
            <NavLink key={section} href={`/admin/content/${section}`}>
              {t(`admin.content.sections.${section}`)}
            </NavLink>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
