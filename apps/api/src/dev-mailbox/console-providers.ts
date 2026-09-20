import { Logger } from "@nestjs/common";
import type { EmailMessage, EmailProvider } from "../notifications/email";
import type { SmsMessage, SmsProvider } from "../notifications/sms";
import type { DevMailboxService } from "./dev-mailbox.service";

/** Development email provider: stores the message in the dev mailbox instead of sending it. */
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger("ConsoleEmail");

  constructor(private readonly mailbox: DevMailboxService) {}

  async deliver(message: EmailMessage): Promise<void> {
    await this.mailbox.record({ channel: "email", ...message, body: message.text });
    // The recipient is redacted by the scrubbing logger; read it from GET /api/dev/mailbox.
    this.logger.log(`email "${message.subject}" to ${message.to} stored in the dev mailbox`);
  }
}

/** Development SMS provider: logs the text (so OTPs are visible locally) and stores it. */
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger("ConsoleSms");

  constructor(private readonly mailbox: DevMailboxService) {}

  async send(message: SmsMessage): Promise<void> {
    await this.mailbox.record({ channel: "sms", to: message.to, body: message.text });
    this.logger.log(`sms to ${message.to}: ${message.text}`);
  }
}
