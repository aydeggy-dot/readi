# @readi/api-client

Placeholder. The typed client will be **generated** from the API's OpenAPI document (ADR-0003), which is
built from the Zod DTOs by `createOpenApiDocument` in `apps/api/src/openapi.ts` and served at
`http://127.0.0.1:4000/docs-json` in development.

Generation is wired up once the API has endpoints the web app calls from the browser (Milestone M1).
Until then the web app validates responses directly with the schemas from `@readi/shared-types`.
