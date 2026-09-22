// Grants a role to an existing user, with an audit entry:
//   pnpm --filter @readi/api admin:grant -- --email <their-email> --role admin
// In production it refuses unless --acknowledge-production is passed (see ./production.ts).
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { Role } from "@readi/shared-types";
import { loadEnvFile, parseEnv } from "../config/env";
import { PrismaClient } from "../generated/prisma/client";
import { resolveActor, UnknownActorError } from "./actor";
import { cliArgs } from "./args";
import { needsProductionAcknowledgement, PRODUCTION_REFUSAL } from "./production";
import { setUserRole, UserNotFoundError } from "../users/roles.service";

async function main(): Promise<number> {
  const { values } = parseArgs({
    args: cliArgs(),
    options: {
      email: { type: "string" },
      role: { type: "string", default: "admin" },
      actor: { type: "string" },
      "acknowledge-production": { type: "boolean", default: false },
    },
  });
  const role = Role.safeParse(values.role);
  if (!values.email || !role.success) {
    console.error(
      "usage: admin:grant -- --email <email> [--role candidate|content_expert|admin] " +
        "[--actor <your admin email>] [--acknowledge-production]",
    );
    return 2;
  }
  loadEnvFile();
  const env = parseEnv(process.env);
  if (needsProductionAcknowledgement(env.NODE_ENV, values["acknowledge-production"])) {
    console.error(PRODUCTION_REFUSAL);
    return 2;
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  try {
    const result = await setUserRole(prisma, {
      email: values.email,
      role: role.data,
      actor: await resolveActor(prisma, values.actor),
    });
    console.log(`role changed: ${result.previousRole} -> ${role.data} (user ${result.userId})`);
    return 0;
  } catch (error) {
    if (error instanceof UnknownActorError) {
      console.error(`--actor: ${error.message}`);
      return 2;
    }
    if (error instanceof UserNotFoundError) {
      console.error("no user with that email; sign up first");
      return 1;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

void main().then((code) => process.exit(code));
