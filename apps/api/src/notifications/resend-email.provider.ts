import { Resend } from "resend";
import type { EmailMessage, EmailProvider } from "./email";

export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async deliver(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    // Resend reports failures in the result instead of throwing. Its message may echo the address,
    // so only the error name is surfaced (logs are scrubbed as well).
    if (error) throw new Error(`Resend delivery failed: ${error.name}`);
  }
}
