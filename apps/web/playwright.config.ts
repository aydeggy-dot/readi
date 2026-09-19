import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (M1 acceptance): the real web app, API and AI worker, with the console email/SMS
// providers (dev mailbox) and LLM_PROVIDER=fake, so no external service is called and nothing costs
// money. `pnpm test:e2e` (scripts/e2e.sh) prepares the database and bucket and builds both apps into
// their own output folders first; the servers below only start what it built.
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3010);
const API_PORT = Number(process.env.E2E_API_PORT ?? 4010);
const WORKER_PORT = Number(process.env.E2E_WORKER_PORT ?? 8010);
const webUrl = `http://127.0.0.1:${WEB_PORT}`;
const apiUrl = `http://127.0.0.1:${API_PORT}`;
const workerUrl = `http://127.0.0.1:${WORKER_PORT}`;

// Never a real secret: these only have to satisfy the apps' length checks locally and in CI.
const AUTH_SECRET = "e2e-only-secret-not-used-anywhere-else-0123456789";
const WORKER_TOKEN = "e2e-only-worker-token-not-used-anywhere-else-01234";

const database = process.env.DATABASE_URL ?? "postgresql://readi:readi@127.0.0.1:15432/readi_e2e";
const redis = process.env.REDIS_URL ?? "redis://127.0.0.1:16379/2";
const s3Endpoint = process.env.S3_ENDPOINT ?? "http://127.0.0.1:19000";
const bucket = process.env.S3_BUCKET ?? "readi-e2e";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: webUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  // Mobile first (CLAUDE.md §5): the suite runs at 360px, the narrowest width we support.
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 } },
    },
  ],
  webServer: [
    {
      name: "api",
      command: "node ../api/dist-cli/src/main.js",
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
      env: {
        // Not "production": that (rightly) refuses the console providers, http URLs and the local
        // S3 credentials this run uses.
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        PORT: String(API_PORT),
        DATABASE_URL: database,
        REDIS_URL: redis,
        PUBLIC_WEB_URL: webUrl,
        BETTER_AUTH_SECRET: AUTH_SECRET,
        // Off so repeated runs from one IP are not throttled; limits have their own tests.
        AUTH_RATE_LIMIT_ENABLED: "false",
        EMAIL_PROVIDER: "console",
        SMS_PROVIDER: "console",
        SUPPORT_EMAIL: "support@readi.example",
        S3_ENDPOINT: s3Endpoint,
        S3_BUCKET: bucket,
        AI_WORKER_URL: workerUrl,
        AI_WORKER_TOKEN: WORKER_TOKEN,
        JOBS_ENABLED: "true",
        QUEUE_PREFIX: "e2e",
      },
    },
    {
      name: "worker",
      command: "uv run python -m readi_worker",
      cwd: "../ai-worker",
      url: `${workerUrl}/health`,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
      env: {
        HOST: "127.0.0.1",
        PORT: String(WORKER_PORT),
        REDIS_URL: redis,
        SERVICE_TOKEN: WORKER_TOKEN,
        LLM_PROVIDER: "fake",
        // Not "development": that starts uvicorn with the file watcher.
        ENVIRONMENT: "test",
      },
    },
    {
      name: "web",
      command: `pnpm exec next start --port ${WEB_PORT}`,
      url: `${webUrl}/login`,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
      env: {
        NODE_ENV: "production",
        APP_ENV: "development",
        NEXT_DIST_DIR: ".next-e2e",
        // Must match the value the build used: rewrites are fixed at build time.
        API_INTERNAL_URL: apiUrl,
      },
    },
  ],
});
