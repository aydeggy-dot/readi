import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { randomUUID } from "node:crypto";

/** Phone sign-in is limited to Nigerian numbers at MVP (spec §4.1, M1 decision 3). */
export const ALLOWED_PHONE_COUNTRIES = ["NG"] as const;

/** Accepts only canonical E.164 strings (e.g. +2348031234567) for a valid mobile number in an allowed country. */
export function isAllowedPhoneNumber(input: string): boolean {
  const parsed = parsePhoneNumberFromString(input);
  if (!parsed?.isValid() || parsed.number !== input) return false;
  const type = parsed.getType();
  return (
    (ALLOWED_PHONE_COUNTRIES as readonly string[]).includes(parsed.country ?? "") &&
    (type === "MOBILE" || type === "FIXED_LINE_OR_MOBILE")
  );
}

/**
 * Better Auth requires an email on every user; phone sign-ups get a random placeholder under the
 * reserved `.invalid` TLD (ADR-0009). It never contains the phone number and is never shown or sent to.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = "phone.readi.invalid";

export function placeholderEmail(): string {
  return `user-${randomUUID()}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}
