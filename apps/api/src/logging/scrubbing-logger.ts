import { ConsoleLogger } from "@nestjs/common";
import { scrubValue } from "./scrub";

/** Nest's console logger with PII redaction on every message and parameter. */
export class ScrubbingLogger extends ConsoleLogger {
  override log(message: unknown, ...rest: unknown[]): void {
    super.log(scrubValue(message), ...rest.map(scrubValue));
  }
  override error(message: unknown, ...rest: unknown[]): void {
    super.error(scrubValue(message), ...rest.map(scrubValue));
  }
  override warn(message: unknown, ...rest: unknown[]): void {
    super.warn(scrubValue(message), ...rest.map(scrubValue));
  }
  override debug(message: unknown, ...rest: unknown[]): void {
    super.debug(scrubValue(message), ...rest.map(scrubValue));
  }
  override verbose(message: unknown, ...rest: unknown[]): void {
    super.verbose(scrubValue(message), ...rest.map(scrubValue));
  }
  override fatal(message: unknown, ...rest: unknown[]): void {
    super.fatal(scrubValue(message), ...rest.map(scrubValue));
  }
}
