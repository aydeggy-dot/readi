import { HttpException, type HttpStatus } from "@nestjs/common";
import { ZodValidationException } from "nestjs-zod";

/**
 * An error with a stable machine-readable `code` the web app maps to translated copy. The message is
 * for developers and logs; it must never contain personal data.
 */
export class ApiError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string) {
    super({ statusCode: status, code, message }, status);
  }
}

/** A 400 in the same shape as request-validation failures, for rules checked in services. */
export function fieldError(field: string, message: string): ZodValidationException {
  return new ZodValidationException({ issues: [{ code: "custom", path: [field], message }] });
}
