// Redacts personal data from log output (CLAUDE.md §5: never log emails or phone numbers; use ids).
// Applied to every Nest log line and to Better Auth's logger. Deliberately conservative: long digit
// runs that are not phone-shaped (ids, timestamps) are left alone.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// E.164 (+ followed by 8–15 digits), Nigerian numbers without "+" (234 + 10 digits) as Termii
// expects them, and Nigerian local format (0 + 10 digits starting 7/8/9).
const PHONE = /\+\d{8,15}\b|\b234[789]\d{9}\b|\b0[789][01]\d{8}\b/g;

export const REDACTED_EMAIL = "[redacted-email]";
export const REDACTED_PHONE = "[redacted-phone]";

export function scrub(text: string): string {
  return text.replace(EMAIL, REDACTED_EMAIL).replace(PHONE, REDACTED_PHONE);
}

/** Scrubs strings and errors; other values are stringified first so nothing bypasses redaction. */
export function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return scrub(value);
  if (value instanceof Error) {
    const copy = new Error(scrub(value.message));
    copy.name = value.name;
    copy.stack = value.stack === undefined ? undefined : scrub(value.stack);
    return copy;
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  try {
    return scrub(JSON.stringify(value));
  } catch {
    return "[unserialisable]";
  }
}
