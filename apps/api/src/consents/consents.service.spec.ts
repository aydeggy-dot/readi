import { beforeEach, describe, expect, it, vi } from "vitest";

// The current texts, with one version bumped: the point of this spec is what happens to a decision
// the user made against the previous wording. CONSENT_VERSIONS is a constant, so it is mocked.
vi.mock("@readi/shared-types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@readi/shared-types")>();
  return { ...actual, CONSENT_VERSIONS: { ...actual.CONSENT_VERSIONS, marketing: 2 } };
});

// Static imports are fine: vitest hoists vi.mock above them (and apps/api type-checks tests as
// CommonJS, where a top-level await does not compile — tasks/lessons.md).
import { CONSENT_TYPES } from "@readi/shared-types";
import type { ConsentRecord } from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { ConsentsService } from "./consents.service";

const USER = "0b0d0b0d-0b0d-4b0d-8b0d-0b0d0b0d0b0d";

/** One stored decision per type, all granted; `marketing` was decided against the old wording. */
const records: ConsentRecord[] = CONSENT_TYPES.map((type) => ({
  id: type,
  userId: USER,
  type,
  granted: true,
  version: 1,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
}));

const findMany = vi.fn<() => Promise<ConsentRecord[]>>();
const prisma = { consentRecord: { findMany } } as unknown as PrismaService;

describe("ConsentsService with a bumped consent version", () => {
  beforeEach(() => {
    findMany.mockResolvedValue(records);
  });

  it("reports the outdated decision as not granted, and names both versions", async () => {
    const statuses = await new ConsentsService(prisma).list(USER);
    const marketing = statuses.find((status) => status.type === "marketing");
    expect(marketing).toMatchObject({ granted: false, version: 1, current_version: 2 });
    // The others are untouched.
    expect(statuses.filter((status) => status.granted)).toHaveLength(CONSENT_TYPES.length - 1);
  });

  it("treats the type as undecided, so onboarding asks again", async () => {
    expect(await new ConsentsService(prisma).allDecided(USER)).toBe(false);
  });

  it("is decided again once the user answers the current text", async () => {
    findMany.mockResolvedValue(
      records.map((record) => (record.type === "marketing" ? { ...record, version: 2 } : record)),
    );
    expect(await new ConsentsService(prisma).allDecided(USER)).toBe(true);
  });
});

describe("who may be sampled", () => {
  const OTHER = "1c1e1c1e-1c1e-4c1e-8c1e-1c1e1c1e1c1e";

  it("asks the shared predicate, so one user's answer is read the same way as the set's", async () => {
    findMany.mockResolvedValue(records);
    const service = new ConsentsService(prisma);
    expect(await service.hasGranted(USER, "transcript_review")).toBe(true);
    // `marketing` is granted at version 1 and the current text is version 2 (mocked above), so the
    // same stale-yes rule that hides it from `list()` also keeps it out of `hasGranted`.
    expect(await service.hasGranted(USER, "marketing")).toBe(false);
  });

  it("returns only the users whose latest row granted the current text", async () => {
    findMany.mockResolvedValue([
      { ...records[0], id: "a", userId: USER, type: "transcript_review", granted: true },
      { ...records[0], id: "b", userId: OTHER, type: "transcript_review", granted: false },
    ]);
    expect(await new ConsentsService(prisma).usersGranting("transcript_review")).toEqual([USER]);
  });

  it("takes the latest row per user, which is what `distinct` is asked for", async () => {
    findMany.mockResolvedValue([]);
    await new ConsentsService(prisma).usersGranting("transcript_review");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: "transcript_review" },
        orderBy: { createdAt: "desc" },
        distinct: ["userId"],
      }),
    );
  });
});
