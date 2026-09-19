# Architecture Decision Records

One file per decision: `NNNN-short-title.md`. Never rewrite an accepted ADR — supersede it with a new one
and set the old one's status to `Superseded by NNNN`.

Sections: **Status**, **Date**, **Context**, **Decision**, **Consequences**, **Alternatives considered**.

| # | Title | Status |
|---|---|---|
| [0001](0001-monorepo-and-stack.md) | Monorepo layout, stack versions, and local infrastructure | Accepted |
| [0002](0002-vitest-everywhere.md) | Vitest as the single TypeScript test runner | Accepted |
| [0003](0003-zod-source-of-truth.md) | Zod is the source of truth for shared contracts; Pydantic models are generated | Accepted |
| [0004](0004-worker-has-no-db-access.md) | The AI worker has no direct database access | Accepted |
| [0005](0005-better-auth.md) | Better Auth, hosted in the NestJS API | Accepted |
| [0006](0006-embeddings-voyage.md) | Voyage AI for embeddings | Accepted |
| [0007](0007-ai-cost-micro-usd.md) | AI cost in integer micro-USD, in a separate `ai_call_log` | Accepted |
| [0008](0008-langfuse-personal-data-store.md) | Langfuse is treated as a personal-data store | Accepted |
| [0009](0009-auth-integration.md) | Auth integration: Better Auth in NestJS, same-origin cookies, trusted client IP | Accepted |
| [0010](0010-llm-adapter-and-cv-parsing.md) | LLM adapter and CV parsing: browser upload to storage, extraction in the worker | Accepted |
| [0012](0012-web-client-and-session.md) | Web client: generated API client, server-resolved sessions, forms without Zod | Accepted |
