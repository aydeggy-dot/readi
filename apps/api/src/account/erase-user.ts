import type { PrismaClient } from "../generated/prisma/client";
import type { StorageService } from "../storage/storage.service";

/**
 * Columns that reference a user WITHOUT a foreign key, in rows kept after the user is erased
 * (ADR-0011). Erasure replaces the user's id in each with the tombstone id. Every other user
 * reference is a foreign key with ON DELETE CASCADE. A test fails if a new unlisted one appears —
 * but it only inspects uuid columns, so a kept table that stores an email or phone number as text
 * needs its own handling here.
 */
export const TOMBSTONED_COLUMNS = [
  { table: "audit_logs", column: "actor_id" },
  { table: "audit_logs", column: "target_id" },
  { table: "ai_call_log", column: "user_id" },
  // Learning content outlives the expert who wrote it (ADR-0014).
  { table: "tracks", column: "created_by_user_id" },
  { table: "lessons", column: "created_by_user_id" },
  { table: "rubrics", column: "created_by_user_id" },
  { table: "questions", column: "created_by_user_id" },
  { table: "content_versions", column: "changed_by_user_id" },
  // Who vouched for a model's draft outlives their account too (ADR-0014 decision 6).
  { table: "tracks", column: "reviewed_by_user_id" },
  { table: "lessons", column: "reviewed_by_user_id" },
  { table: "rubrics", column: "reviewed_by_user_id" },
  { table: "questions", column: "reviewed_by_user_id" },
  // The catalogue is content too, written and reviewed by the same people (ADR-0015).
  { table: "career_roles", column: "created_by_user_id" },
  { table: "career_levels", column: "created_by_user_id" },
  { table: "stacks", column: "created_by_user_id" },
  { table: "career_roles", column: "reviewed_by_user_id" },
  { table: "career_levels", column: "reviewed_by_user_id" },
  { table: "stacks", column: "reviewed_by_user_id" },
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
    // Content the user authored stays exactly as it is; only the authorship reference moves to the
    // tombstone (ADR-0014). A candidate's own content flags are personal and cascade with the row.
    const authored = { createdByUserId: userId };
    const toTombstone = { createdByUserId: tombstone.id };
    await tx.track.updateMany({ where: authored, data: toTombstone });
    await tx.lesson.updateMany({ where: authored, data: toTombstone });
    await tx.rubric.updateMany({ where: authored, data: toTombstone });
    await tx.question.updateMany({ where: authored, data: toTombstone });
    await tx.careerRole.updateMany({ where: authored, data: toTombstone });
    await tx.careerLevel.updateMany({ where: authored, data: toTombstone });
    await tx.stack.updateMany({ where: authored, data: toTombstone });
    // The same for whoever marked a model's draft reviewed (ADR-0014 decision 6): the review
    // stands, and only the name behind it goes.
    const reviewed = { reviewedByUserId: userId };
    const reviewedByTombstone = { reviewedByUserId: tombstone.id };
    await tx.track.updateMany({ where: reviewed, data: reviewedByTombstone });
    await tx.lesson.updateMany({ where: reviewed, data: reviewedByTombstone });
    await tx.rubric.updateMany({ where: reviewed, data: reviewedByTombstone });
    await tx.question.updateMany({ where: reviewed, data: reviewedByTombstone });
    await tx.careerRole.updateMany({ where: reviewed, data: reviewedByTombstone });
    await tx.careerLevel.updateMany({ where: reviewed, data: reviewedByTombstone });
    await tx.stack.updateMany({ where: reviewed, data: reviewedByTombstone });
    await tx.contentVersion.updateMany({
      where: { changedByUserId: userId },
      data: { changedByUserId: tombstone.id },
    });
    // Codes and reset tokens. Identifiers are sometimes the bare address or number and sometimes
    // suffixed (Better Auth writes `<phone>-request-password-reset`), so match by prefix too.
    await tx.verification.deleteMany({
      where: {
        OR: [
          { value: userId },
          { identifier: { startsWith: due.email } },
          ...(due.phoneNumber ? [{ identifier: { startsWith: due.phoneNumber } }] : []),
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
