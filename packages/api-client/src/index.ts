import createClient, { type Client, type ClientOptions } from "openapi-fetch";
import type { components, paths } from "./generated/schema.js";

export type { components, paths };
export type ApiClient = Client<paths>;

/**
 * Typed client for the Readi API, generated from its OpenAPI document (ADR-0012). In the browser use
 * the default same-origin base URL (the web app proxies /api/*); on the server pass the API's URL and
 * forward the user's cookie.
 */
export function createApiClient(options: ClientOptions = {}): ApiClient {
  return createClient<paths>({ baseUrl: "", ...options });
}

/** Error body of a non-validation API error: a stable code the web app maps to translated copy. */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

/** Error body of a 400 from request validation: the path of each invalid field. */
export interface ValidationErrorBody {
  statusCode: 400;
  message: string;
  errors: { path: (string | number)[]; message: string }[];
}

/** The `code` of an API error body, if it has one. */
export function errorCode(body: unknown): string | undefined {
  return typeof body === "object" &&
    body !== null &&
    "code" in body &&
    typeof body.code === "string"
    ? body.code
    : undefined;
}

/** The top-level field names a validation error body reports as invalid. */
export function invalidFields(body: unknown): string[] {
  if (
    typeof body !== "object" ||
    body === null ||
    !("errors" in body) ||
    !Array.isArray(body.errors)
  ) {
    return [];
  }
  const fields = (body.errors as unknown[]).flatMap((issue) => {
    const path: unknown =
      typeof issue === "object" && issue !== null && "path" in issue ? issue.path : undefined;
    const first: unknown = Array.isArray(path) ? path[0] : undefined;
    return typeof first === "string" ? [first] : [];
  });
  return [...new Set(fields)];
}
