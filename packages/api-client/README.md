# @readi/api-client

Typed client for the Readi API (ADR-0012). The types in `src/generated/schema.ts` are **generated** from
`openapi.json`, which the API exports from its controllers and Zod DTOs without a database:

```bash
pnpm gen:contracts      # regenerates this package too; commit the result
pnpm check:contracts    # fails if the committed files are stale (CI)
```

Never edit `openapi.json` or `src/generated/` by hand. Runtime: [openapi-fetch](https://openapi-ts.dev/openapi-fetch/)
(about 6 KB), safe for browser code.
