// Browser configuration, inlined by Next.js at build time and validated there (next.config.ts).
// Kept free of Zod on purpose: this module ships to every page.
const unsetIfEmpty = (value: string | undefined) => (value ? value : undefined);

export const clientEnv = {
  posthogKey: unsetIfEmpty(process.env.NEXT_PUBLIC_POSTHOG_KEY),
  posthogHost: unsetIfEmpty(process.env.NEXT_PUBLIC_POSTHOG_HOST) ?? "https://eu.i.posthog.com",
  sentryDsn: unsetIfEmpty(process.env.NEXT_PUBLIC_SENTRY_DSN),
};
