import { createApiClient } from "@readi/api-client";

/** API client for client components: same-origin /api/* through the web proxy (ADR-0009, ADR-0012). */
export const browserApi = createApiClient();
