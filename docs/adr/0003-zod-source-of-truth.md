# 0003 — Zod is the source of truth for shared contracts; Pydantic models are generated

**Status:** Accepted · **Date:** 2026-09-19

## Context
Contracts cross three boundaries: web ↔ API (TypeScript), API ↔ AI worker (TypeScript ↔ Python), and
LLM structured output (validated in Python, stored and rendered in TypeScript). The spec requires the answer
evaluation schema to be "shared: Pydantic ↔ Zod" but said nothing about how the two stay in sync.
CLAUDE.md also left API validation open ("Zod or class-validator").

## Decision
1. **Zod schemas in `packages/shared-types` are the single source of truth** for every contract that crosses
   a process or language boundary (HTTP bodies, worker requests/responses, streaming events, evaluation
   output, seed-file format).
2. **API validation uses Zod via `nestjs-zod`.** DTOs are derived from the shared schemas; `class-validator`
   is not used. The OpenAPI spec is generated from those schemas, and `packages/api-client` is generated
   from the OpenAPI spec.
3. **Pydantic models are generated, never hand-written, for shared contracts:**
   Zod → JSON Schema (Zod's JSON Schema export) → Pydantic v2 (`datamodel-code-generator`) →
   `apps/ai-worker/readi_worker/contracts/generated/`. Generated files are committed and carry a
   "do not edit" header.
4. **CI drift check:** CI regenerates JSON Schema and Pydantic models and fails on `git diff --exit-code`.
5. Shared contracts use only Zod features that survive JSON Schema export. Cross-field business rules
   (e.g. "non-zero score requires evidence") are implemented as explicit validator functions in both
   languages and tested against **one shared fixture set** (valid and invalid JSON examples).
6. Worker-internal models that never leave Python stay hand-written Pydantic.

## Consequences
- One place to change a contract; type drift between languages becomes a CI failure rather than a runtime bug.
- A codegen step (`pnpm gen:contracts`) must run after editing shared schemas; `turbo` wires it as a
  dependency of `typecheck` and `build`.
- Generated Pydantic code is less idiomatic than hand-written models; acceptable for boundary types.
- Exact tool versions and the generator config are pinned in Milestone M0 and verified there.

## Alternatives considered
- **Pydantic as the source** (export JSON Schema → generate Zod) — the TypeScript side owns more contracts
  (all web ↔ API traffic), so it is the natural source.
- **Hand-maintained twins** — the status quo; drifts silently.
- **JSON Schema files as the source** — neutral, but authoring raw JSON Schema is worse than Zod and both
  sides would then be generated.
