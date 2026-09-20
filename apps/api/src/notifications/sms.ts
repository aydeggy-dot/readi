export interface SmsMessage {
  /** E.164, e.g. +2348031234567. */
  to: string;
  text: string;
}

/** SMS backend (Termii in production, the dev mailbox locally), behind our own interface (ADR-0005). */
export interface SmsProvider {
  send(message: SmsMessage): Promise<void>;
}
