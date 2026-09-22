import { HttpException, type HttpStatus } from "@nestjs/common";
import { ZodValidationException } from "nestjs-zod";

/**
 * An error with a stable machine-readable `code` the web app maps to translated copy. The message is
 * for developers and logs; it must never contain personal data.
 *
 * `details` is for the few refusals whose copy needs a number — "you cannot take that level off
 * this role, **4** candidates are preparing at it". It is part of the response body, so the same
 * rule applies twice over: **counts and ids only, never a name, an email or anything a person
 * wrote**. The web app still renders its own copy (ADR-0012); `details` only fills the blanks in it.
 */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    details?: Readonly<Record<string, number>>,
  ) {
    super({ statusCode: status, code, message, ...(details ? { details } : {}) }, status);
  }
}

/**
 * A 400 in the same shape as request-validation failures, for rules checked in services. The path
 * is segmented as Zod writes it (["decisions", 0, "type"]), so the web app can match on its first
 * segment like any other validation error.
 */
export function fieldError(
  path: string | (string | number)[],
  message: string,
): ZodValidationException {
  return new ZodValidationException({
    issues: [{ code: "custom", path: Array.isArray(path) ? path : [path], message }],
  });
}
