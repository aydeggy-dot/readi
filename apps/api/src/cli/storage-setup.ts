// Prepares the object-storage bucket (create locally, CORS for browser uploads, upload expiry):
//   pnpm --filter @readi/api storage:setup
import { loadEnvFile, parseEnv } from "../config/env";
import { setUpBucket } from "../storage/storage.service";

async function main(): Promise<void> {
  loadEnvFile();
  const env = parseEnv(process.env);
  for (const step of await setUpBucket(env)) console.log(`storage: ${step}`);
}

main().catch((error: unknown) => {
  // The SDK error name and HTTP status only; messages can include request details.
  const name = error instanceof Error ? error.name : "Error";
  console.error(
    `storage setup failed: ${name}${error instanceof Error ? `: ${error.message}` : ""}`,
  );
  process.exit(1);
});
