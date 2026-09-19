import type { PrismaClient } from "../generated/prisma/client";

export class DeletionNotCancellableError extends Error {
  override name = "DeletionNotCancellableError";
}

/**
 * Cancels a scheduled account deletion during the grace period (ADR-0011) and records who did it.
 * Only an admin action (the `admin:cancel-deletion` CLI), after the user asks support. The user
 * then signs in again as usual. Refused once the grace period is over: erasure may be under way.
 */
export async function cancelDeletion(
  prisma: PrismaClient,
  input: {
    user: { email: string } | { phoneNumber: string };
    actor: { type: "admin" | "system"; id?: string };
  },
  now = new Date(),
): Promise<{ userId: string }> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where:
        "email" in input.user
          ? { email: input.user.email.toLowerCase() }
          : { phoneNumber: input.user.phoneNumber },
      select: { id: true, deletedAt: true, deletionScheduledFor: true },
    });
    if (!user?.deletedAt || !user.deletionScheduledFor) {
      throw new DeletionNotCancellableError("no account scheduled for deletion matches");
    }
    const restored = await tx.user.updateMany({
      where: { id: user.id, deletedAt: { not: null }, deletionScheduledFor: { gt: now } },
      data: { deletedAt: null, deletionScheduledFor: null },
    });
    if (restored.count === 0) {
      throw new DeletionNotCancellableError(
        "the grace period is over; the account is being erased",
      );
    }
    await tx.auditLog.create({
      data: {
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        action: "user.deletion.cancelled",
        targetType: "user",
        targetId: user.id,
        before: { deletion_scheduled_for: user.deletionScheduledFor.toISOString() },
      },
    });
    return { userId: user.id };
  });
}
