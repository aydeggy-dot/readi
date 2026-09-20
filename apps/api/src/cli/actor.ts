import type { PrismaClient } from "../generated/prisma/client";

export class UnknownActorError extends Error {
  override name = "UnknownActorError";
}

/**
 * Who is running an admin CLI, for the audit entry. Passing `--actor <email>` records that admin's
 * user id, so a privilege change can be attributed to a person; without it the entry is a `system`
 * action, which is honest but anonymous. The named user must already be an admin.
 */
export async function resolveActor(
  prisma: PrismaClient,
  email: string | undefined,
): Promise<{ type: "admin" | "system"; id?: string }> {
  if (!email) return { type: "system" };
  const actor = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, role: true },
  });
  if (!actor) throw new UnknownActorError("no user with that email");
  if (actor.role !== "admin") throw new UnknownActorError("--actor must name an admin");
  return { type: "admin", id: actor.id };
}
