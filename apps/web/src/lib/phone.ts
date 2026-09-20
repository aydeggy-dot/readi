/**
 * Normalises a Nigerian phone number as people type it (0803 123 4567, 803…, 234…, +234…) to E.164.
 * Returns null for anything else. The API does the authoritative check (mobile numbers only).
 */
export function toNigerianE164(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, "");
  const national = /^\+?2340?(\d{10})$/.exec(compact)?.[1] ?? /^0?(\d{10})$/.exec(compact)?.[1];
  return national && /^[1-9]/.test(national) ? `+234${national}` : null;
}
