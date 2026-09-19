import { randomUUID } from "node:crypto";

const API_URL = process.env.E2E_API_URL ?? `http://127.0.0.1:${process.env.E2E_API_PORT ?? 4010}`;

/** A fresh address per run, so a rerun never meets the previous run's account. */
export const uniqueEmail = () => `e2e-${randomUUID()}@example.com`;

export interface MailboxEntry {
  channel: string;
  to: string;
  subject?: string;
  body: string;
}

/** Emails and texts the console providers "sent" (development only; ADR-0009). */
export async function readMailbox(to: string): Promise<MailboxEntry[]> {
  const response = await fetch(`${API_URL}/api/dev/mailbox?to=${encodeURIComponent(to)}`);
  if (!response.ok) throw new Error(`dev mailbox read failed: HTTP ${response.status}`);
  return (await response.json()) as MailboxEntry[];
}
