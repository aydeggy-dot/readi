import type { ContentStatus, Topic } from "@readi/shared-types";
import {
  CONTENT_STATUSES,
  EXPERIENCE_LEVELS,
  QUESTION_TYPES,
  TARGET_ROLES,
} from "@readi/shared-types/constants";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge, SeedBadge } from "@/components/admin/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TextLink } from "@/components/ui/text-link";
import { t } from "@/i18n";
import { formatDay } from "@/i18n";
import type { ContentQuery } from "@/lib/content-query";
import { isFiltered, nextPageHref } from "@/lib/content-query";

/**
 * The CMS's lists: one filter bar, one row shape and one pager over four kinds of content.
 *
 * Everything here is a server component. The filter bar is a plain GET form and the pager is a
 * link, so a list filters, searches and pages with no JavaScript at all — which is what a content
 * expert on a phone and a slow connection actually needs.
 */

/** Which filters an entity understands; the rest would be ignored by its endpoint anyway. */
export interface FilterFields {
  status?: boolean;
  role?: boolean;
  level?: boolean;
  type?: boolean;
  topic?: boolean;
}

export function ContentFilters({
  action,
  query,
  fields,
  topics = [],
}: {
  action: string;
  query: ContentQuery;
  fields: FilterFields;
  topics?: Topic[];
}) {
  return (
    <form method="get" action={action} className="flex flex-col gap-3 border-t border-frame pt-6">
      {/* No cursor field: changing a filter starts again from the first page. */}
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="sr-only">{t("admin.content.filters.legend")}</legend>
        <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <span className="font-bold text-heading">{t("admin.content.filters.search")}</span>
          <Input
            type="search"
            name="q"
            defaultValue={query.q ?? ""}
            placeholder={t("admin.content.filters.searchHint")}
          />
        </label>
        {fields.status && (
          <FilterSelect
            name="status"
            label={t("admin.content.filters.status")}
            value={query.status}
            options={CONTENT_STATUSES.map((value) => ({
              value,
              label: t(`admin.content.status.${value}`),
            }))}
          />
        )}
        {fields.type && (
          <FilterSelect
            name="type"
            label={t("admin.content.filters.type")}
            value={query.type}
            options={QUESTION_TYPES.map((value) => ({
              value,
              label: t(`admin.content.question.types.${value}`),
            }))}
          />
        )}
        {fields.role && (
          <FilterSelect
            name="role"
            label={t("admin.content.filters.role")}
            value={query.role}
            options={TARGET_ROLES.map((value) => ({ value, label: t(`targetRoles.${value}`) }))}
          />
        )}
        {fields.level && (
          <FilterSelect
            name="level"
            label={t("admin.content.filters.level")}
            value={query.level}
            options={EXPERIENCE_LEVELS.map((value) => ({ value, label: t(`levels.${value}`) }))}
          />
        )}
        {fields.topic && (
          <FilterSelect
            name="topic_id"
            label={t("admin.content.filters.topic")}
            value={query.topic_id}
            options={topics.map((topic) => ({ value: topic.id, label: topic.name }))}
          />
        )}
      </fieldset>
      <div className="flex items-center gap-4">
        <Button type="submit" variant="outline" size="sm">
          {t("admin.content.filters.apply")}
        </Button>
        {isFiltered(query) && (
          <TextLink href={action} className="text-base">
            {t("admin.content.filters.clear")}
          </TextLink>
        )}
      </div>
    </form>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-bold text-heading">{label}</span>
      <Select name={name} defaultValue={value ?? ""}>
        <option value="">{t("admin.content.filters.any")}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function ContentRows({
  items,
  query,
  children,
}: {
  items: unknown[];
  query: ContentQuery;
  children: ReactNode;
}) {
  if (items.length === 0) {
    return (
      <p className="border-t border-frame pt-6 text-lg text-muted-foreground">
        {isFiltered(query) ? t("admin.content.list.emptyFiltered") : t("admin.content.list.empty")}
      </p>
    );
  }
  return <ul className="divide-y divide-border border-t border-frame">{children}</ul>;
}

/**
 * One item in a list. The title is the link — a row-wide click target is a trap for anyone
 * selecting text, and a link that says where it goes is what a screen reader needs.
 */
export function ContentRow({
  href,
  title,
  subtitle,
  status,
  seedManaged,
  meta,
  updatedAt,
}: {
  href: string;
  /** What the link says. A slug for a question, which has no title of its own. */
  title: string;
  subtitle?: string;
  status?: ContentStatus;
  seedManaged: boolean;
  /** Short facts about the item: its type, its topic, how many criteria it has. */
  meta?: string[];
  updatedAt: string;
}) {
  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xl leading-tight">
          <Link
            href={href}
            className="underline decoration-pen decoration-2 underline-offset-4 hover:decoration-primary"
          >
            {title}
          </Link>
        </h2>
        {subtitle && <span className="text-base text-muted-foreground">{subtitle}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-base text-muted-foreground">
        {status && <StatusBadge status={status} />}
        <SeedBadge seedManaged={seedManaged} />
        {meta?.map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
        <span>{t("admin.content.list.updated", { when: formatDay(updatedAt) })}</span>
      </div>
    </li>
  );
}

export function Pager({
  pathname,
  query,
  nextCursor,
}: {
  pathname: string;
  query: ContentQuery;
  nextCursor: string | null;
}) {
  if (!nextCursor) return null;
  return (
    <Button asChild variant="outline" className="self-start">
      <Link href={nextPageHref(pathname, query, nextCursor)}>{t("admin.content.list.more")}</Link>
    </Button>
  );
}
