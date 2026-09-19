import type { SmsMessage, SmsProvider } from "./sms";

/**
 * Termii SMS (Nigeria). Uses the DND channel so messages reach numbers on the Do-Not-Disturb list,
 * which transactional OTPs must (the sender ID has to be approved for DND by Termii).
 */
export class TermiiSmsProvider implements SmsProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      senderId: string;
      baseUrl: string;
      timeoutMs?: number;
      fetch?: typeof fetch;
    },
  ) {}

  async send(message: SmsMessage): Promise<void> {
    const doFetch = this.options.fetch ?? fetch;
    const response = await doFetch(new URL("/api/sms/send", this.options.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: this.options.apiKey,
        to: message.to.replace(/^\+/, ""), // Termii expects international format without "+"
        from: this.options.senderId,
        sms: message.text,
        type: "plain",
        channel: "dnd",
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
    });
    if (!response.ok) throw new Error(`Termii send failed with HTTP ${response.status}`);
  }
}
