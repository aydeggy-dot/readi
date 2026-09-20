import { en } from "./messages.en";

// User-facing copy sent by the API (emails, SMS) goes through t() like the web app's copy
// (CLAUDE.md §5). English only at launch.
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<typeof en>;

export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  let node: unknown = en;
  for (const part of key.split(".")) {
    node =
      typeof node === "object" && node !== null
        ? (node as Record<string, unknown>)[part]
        : undefined;
  }
  if (typeof node !== "string") throw new Error(`Missing message: ${key}`);
  return node.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Formats a moment as a calendar date for messages, e.g. "26 September 2026" (UTC). */
export function formatMessageDate(date: Date): string {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "long", timeZone: "UTC" }).format(date);
}
