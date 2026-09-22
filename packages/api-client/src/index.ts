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

/**
 * The counts a refusal carries, for the handful whose copy needs a number ("4 candidates are
 * preparing at it"). Numbers only by contract — the API never puts anything a person wrote in here.
 */
export function errorDetails(body: unknown): Record<string, number> {
  if (
    typeof body !== "object" ||
    body === null ||
    !("details" in body) ||
    typeof body.details !== "object" ||
    body.details === null
  ) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(body.details as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
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
