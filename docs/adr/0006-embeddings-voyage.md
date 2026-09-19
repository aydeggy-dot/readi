# 0006 — Voyage AI for embeddings

**Status:** Accepted · **Date:** 2026-09-19

## Context
M2 needs question embeddings (pgvector) for near-duplicate detection, and later for similarity-based
question selection. The stack table named no embedding provider, and Anthropic (our default LLM provider)
does not offer an embeddings API. Prisma has no native pgvector column type.

## Decision
- Add an **`EmbeddingProvider`** adapter alongside the other AI adapters, with a **Voyage AI**
  implementation and a deterministic fake for tests.
- Default model **`voyage-4`** (current general-purpose model per Voyage's docs, checked 2026-09-19).
  Model name comes from config (`EMBEDDING_MODEL`), never business logic.
- Vector dimension is fixed at **1024** (the model's default; `voyage-4-lite` and `voyage-4-large` share it,
  so switching within the family needs re-embedding but no migration). `EMBEDDING_DIMENSIONS=1024` must
  match the migration; the app fails fast at startup if they differ.
- Each embedded row stores `embedding_model` next to the vector, so stale embeddings can be detected and
  re-computed by a backfill job after a model change.
- Prisma declares the column as `Unsupported("vector(1024)")`; similarity queries use raw SQL
  (`<=>` cosine distance) with an HNSW index created in a migration.
- Embeddings are computed by the worker (ADR-0004) and stored by the API. The near-duplicate threshold is
  configurable.

## Consequences
- A second AI vendor (and subprocessor entry) — accepted; volume is small (content publishes, not user traffic).
- Changing dimension later requires a migration plus full re-embed.
- Raw SQL for vector queries sits outside Prisma's type safety; keep it in one repository module with tests.

## Alternatives considered
- **OpenAI embeddings** — also a second vendor; no advantage for our use.
- **Local model in the worker** (e.g. sentence-transformers) — no per-call cost, but adds CPU/RAM and image
  size to the worker for a low-volume feature.
