import type { PrismaClient } from "../generated/prisma/client";
import type { StorageService } from "../storage/storage.service";

/**
 * Columns that reference a user WITHOUT a foreign key, in rows kept after the user is erased
 * (ADR-0011). Erasure replaces the user's id in each with the tombstone id. Every other user
 * reference is a foreign key with ON DELETE CASCADE. A test fails if a new unlisted one appears.
 */
export const TOMBSTONED_COLUMNS = [
  { table: "audit_logs", column: "actor_id" },
  { table: "audit_logs", column: "target_id" },
  { table: "ai_call_log", column: "user_id" },
] as const;

/** Object-storage folder holding a user's files (their CV). */
export const userFilesPrefix = (userId: string) => `cvs/${userId}/`;

/**
 * Erases a user whose deletion grace period is over: their files, every row of personal data
 * (cascading from `users`), and pending verification codes; rows that must be kept get a new
 * tombstone id that nothing links back to the user. Returns false (and changes nothing in the
 * database) if the user is not due, e.g. because the deletion was cancelled.
 *
 * Files go first: if the database step then fails, the next sweep retries both, and no file can
 * outlive the record that would find it.
 */
export async function eraseUser(
  prisma: PrismaClient,
  storage: Pick<StorageService, "deletePrefix">,
  userId: string,
  now = new Date(),
): Promise<boolean> {
  const due = await prisma.user.findFirst({
    where: { id: userId, deletedAt: { not: null }, deletionScheduledFor: { lte: now } },
    select: { email: true, phoneNumber: true },
  });
  if (!due) return false;

  await storage.deletePrefix(userFilesPrefix(userId));

  return prisma.$transaction(async (tx) => {
    // Re-checked inside the transaction: a deletion cancelled meanwhile must not proceed.
    const removed = await tx.user.deleteMany({
      where: { id: userId, deletedAt: { not: null }, deletionScheduledFor: { lte: now } },
    });
    if (removed.count === 0) return false;

    const tombstone = await tx.userTombstone.create({ data: {} });
    await tx.auditLog.updateMany({ where: { actorId: userId }, data: { actorId: tombstone.id } });
    await tx.auditLog.updateMany({ where: { targetId: userId }, data: { targetId: tombstone.id } });
    await tx.aiCallLog.updateMany({ where: { userId }, data: { userId: tombstone.id } });
    // Codes and reset tokens: keyed by phone number or email, or holding the user id.
    await tx.verification.deleteMany({
      where: {
        OR: [
          { value: userId },
          { identifier: { in: [due.email, ...(due.phoneNumber ? [due.phoneNumber] : [])] } },
        ],
      },
    });
    await tx.auditLog.create({
      data: {
        actorType: "system",
        action: "user.erased",
        targetType: "user",
        targetId: tombstone.id,
      },
    });
    return true;
  });
}
