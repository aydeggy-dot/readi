import { type DynamicModule, Module, type Provider } from "@nestjs/common";
import type { Env } from "../config/env";
import { ConsoleEmailProvider, ConsoleSmsProvider } from "../dev-mailbox/console-providers";
import { DevMailboxModule } from "../dev-mailbox/dev-mailbox.module";
import { DevMailboxService } from "../dev-mailbox/dev-mailbox.service";
import { EmailSender } from "./email";
import { ResendEmailProvider } from "./resend-email.provider";
import type { SmsProvider } from "./sms";
import { TermiiSmsProvider } from "./termii-sms.provider";

export const SMS_PROVIDER = Symbol("SMS_PROVIDER");

/** True when this configuration needs the development mailbox (never true in production). */
export function usesDevMailbox(env: Env): boolean {
  return (
    env.NODE_ENV !== "production" &&
    (env.EMAIL_PROVIDER === "console" || env.SMS_PROVIDER === "console")
  );
}

@Module({})
export class NotificationsModule {
  static forRoot(env: Env): DynamicModule {
    const devMailbox = usesDevMailbox(env);

    const emailSender: Provider = {
      provide: EmailSender,
      inject: devMailbox ? [DevMailboxService] : [],
      useFactory: (mailbox?: DevMailboxService) => {
        if (env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY) {
          return new EmailSender(new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM));
        }
        if (!mailbox) throw new Error("console email provider requires the dev mailbox");
        return new EmailSender(new ConsoleEmailProvider(mailbox));
      },
    };

    const smsProvider: Provider = {
      provide: SMS_PROVIDER,
      inject: devMailbox ? [DevMailboxService] : [],
      useFactory: (mailbox?: DevMailboxService): SmsProvider => {
        if (
          env.SMS_PROVIDER === "termii" &&
          env.TERMII_API_KEY &&
          env.TERMII_SENDER_ID &&
          env.TERMII_BASE_URL
        ) {
          return new TermiiSmsProvider({
            apiKey: env.TERMII_API_KEY,
            senderId: env.TERMII_SENDER_ID,
            baseUrl: env.TERMII_BASE_URL,
          });
        }
        if (!mailbox) throw new Error("console SMS provider requires the dev mailbox");
        return new ConsoleSmsProvider(mailbox);
      },
    };

    return {
      module: NotificationsModule,
      global: true,
      imports: devMailbox ? [DevMailboxModule] : [],
      providers: [emailSender, smsProvider],
      exports: [EmailSender, SMS_PROVIDER],
    };
  }
}
