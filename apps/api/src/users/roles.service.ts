import type { Role } from "@readi/shared-types";
import type { PrismaClient } from "../generated/prisma/client";

export class UserNotFoundError extends Error {
  override name = "UserNotFoundError";
}

/**
 * Changes a user's role and records an audit entry in the same transaction. Used by the
 * `admin:grant` CLI now and the admin panel later; never reachable from a candidate request.
 */
export async function setUserRole(
  prisma: PrismaClient,
  input: { email: string; role: Role; actor: { type: "admin" | "system"; id?: string } },
): Promise<{ userId: string; previousRole: Role }> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user) throw new UserNotFoundError("no user with that email");
    await tx.user.update({ where: { id: user.id }, data: { role: input.role } });
    await tx.auditLog.create({
      data: {
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        action: "user.role.changed",
        targetType: "user",
        targetId: user.id,
        before: { role: user.role },
        after: { role: input.role },
      },
    });
    return { userId: user.id, previousRole: user.role };
  });
}
