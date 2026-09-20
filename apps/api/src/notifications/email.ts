export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Delivery backend (Resend in production, the dev mailbox locally). Never call directly: use EmailSender. */
export interface EmailProvider {
  deliver(message: EmailMessage): Promise<void>;
}

export class EmailRefusedError extends Error {
  override name = "EmailRefusedError";
}

/**
 * True for addresses under the reserved `.invalid` TLD (RFC 2606), which is where phone sign-ups
 * get their placeholder email (ADR-0009). Such addresses must never be sent to.
 */
export function isUndeliverableAddress(address: string): boolean {
  const domain = address.trim().toLowerCase().split("@").pop() ?? "";
  return domain === "invalid" || domain.replace(/\.$/, "").endsWith(".invalid");
}

/** The only way the app sends email: refuses placeholder addresses whatever the provider. */
export class EmailSender {
  constructor(private readonly provider: EmailProvider) {}

  async send(message: EmailMessage): Promise<void> {
    if (isUndeliverableAddress(message.to)) {
      throw new EmailRefusedError("refusing to send email to a reserved .invalid address");
    }
    await this.provider.deliver(message);
  }
}
