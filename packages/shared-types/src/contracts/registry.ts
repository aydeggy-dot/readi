import type { z } from "zod";
import { CvParseRequest, CvParseResponse } from "./cv.js";
import { HealthResponse } from "./health.js";

/**
 * Every contract that crosses a language boundary (ADR-0003). `pnpm gen:contracts` exports these to
 * JSON Schema and the AI worker generates Pydantic models from it. Add new cross-language contracts here.
 *
 * Naming rules:
 * - A registered (top-level) contract is named by its registry key and must NOT carry `.meta({ id })`:
 *   nestjs-zod 5.5 emits duplicate OpenAPI components for a DTO whose root schema has an id.
 * - Reusable building blocks nested inside contracts DO carry `.meta({ id })`, so they become one
 *   shared definition (and one Pydantic class) instead of being inlined everywhere.
 */
export const contractRegistry: Record<string, z.ZodType> = {
  HealthResponse,
  CvParseRequest,
  CvParseResponse,
};
