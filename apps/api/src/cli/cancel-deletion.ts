// Cancels a scheduled account deletion during the 7-day grace period, with an audit entry
// (ADR-0011). Run when a user asks support to keep their account:
//   pnpm --filter @readi/api admin:cancel-deletion -- --email user@example.com
//   pnpm --filter @readi/api admin:cancel-deletion -- --phone +2348031234567
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { cancelDeletion, DeletionNotCancellableError } from "../account/cancel-deletion";
import { loadEnvFile, parseEnv } from "../config/env";
import { PrismaClient } from "../generated/prisma/client";
import { resolveActor, UnknownActorError } from "./actor";
import { cliArgs } from "./args";

async function main(): Promise<number> {
  const { values } = parseArgs({
    args: cliArgs(),
    options: { email: { type: "string" }, phone: { type: "string" }, actor: { type: "string" } },
  });
  if (Boolean(values.email) === Boolean(values.phone)) {
    console.error(
      "usage: admin:cancel-deletion -- (--email <email> | --phone <+234…>) [--actor <your admin email>]",
    );
    return 2;
  }
  loadEnvFile();
  const env = parseEnv(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  try {
    const { userId } = await cancelDeletion(prisma, {
      user: values.email ? { email: values.email } : { phoneNumber: values.phone ?? "" },
      actor: await resolveActor(prisma, values.actor),
    });
    console.log(`deletion cancelled (user ${userId}); they can sign in again`);
    return 0;
  } catch (error) {
    if (error instanceof UnknownActorError) {
      console.error(`--actor: ${error.message}`);
      return 2;
    }
    if (error instanceof DeletionNotCancellableError) {
      console.error(`not cancelled: ${error.message}`);
      return 1;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

void main().then((code) => process.exit(code));
