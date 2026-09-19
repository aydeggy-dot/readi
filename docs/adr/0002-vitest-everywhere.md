# 0002 — Vitest as the single TypeScript test runner

**Status:** Accepted · **Date:** 2026-09-19

## Context
CLAUDE.md originally allowed Vitest for TypeScript and Jest for NestJS ("Nest default ok"). Two runners
means two configs, two mocking APIs, two coverage setups, and a Turborepo `test` pipeline that behaves
differently per package.

## Decision
- **Vitest** is the only unit/integration test runner for all TypeScript code: `apps/web`, `apps/api`, and
  every package in `packages/`.
- NestJS relies on `emitDecoratorMetadata` for dependency injection, which Vitest's default esbuild
  transform does not emit. `apps/api` uses an SWC transform plugin for Vitest so decorator metadata works.
- HTTP integration tests in `apps/api` use `supertest` against a Nest app built from the real module graph.
- **Playwright** for e2e, **pytest** for Python — unchanged.

## Consequences
- One assertion/mocking API across the monorepo; shared Vitest preset lives in `packages/config`.
- The Nest CLI generates Jest-style `*.spec.ts` files; generated specs are converted to Vitest
  (`vi` instead of `jest`) and the Jest dependencies are removed from `apps/api`.
- Most Nest testing docs show Jest; the translation is mechanical (`jest.fn` → `vi.fn`).

## Alternatives considered
- **Jest everywhere** — slower, weaker ESM support, and Next.js/Vite-era tooling is converging on Vitest.
- **Mixed (status quo)** — rejected for the config and cognitive overhead above.
