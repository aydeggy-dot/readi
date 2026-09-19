import { beforeEach, describe, expect, it, vi } from "vitest";

// The current texts, with one version bumped: the point of this spec is what happens to a decision
// the user made against the previous wording. CONSENT_VERSIONS is a constant, so it is mocked.
vi.mock("@readi/shared-types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@readi/shared-types")>();
  return { ...actual, CONSENT_VERSIONS: { ...actual.CONSENT_VERSIONS, marketing: 2 } };
});

const { ConsentsService } = await import("./consents.service");
const { CONSENT_TYPES } = await import("@readi/shared-types");

const USER = "0b0d0b0d-0b0d-4b0d-8b0d-0b0d0b0d0b0d";

/** One stored decision per type, all granted; `marketing` was decided against the old wording. */
const records = CONSENT_TYPES.map((type) => ({
  id: type,
  userId: USER,
  type,
  granted: true,
  version: 1,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
}));

const prisma = {
  consentRecord: { findMany: vi.fn() },
} as unknown as import("../prisma/prisma.service").PrismaService;

describe("ConsentsService with a bumped consent version", () => {
  beforeEach(() => {
    vi.mocked(prisma.consentRecord.findMany).mockResolvedValue(records);
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
    vi.mocked(prisma.consentRecord.findMany).mockResolvedValue(
      records.map((record) => (record.type === "marketing" ? { ...record, version: 2 } : record)),
    );
    expect(await new ConsentsService(prisma).allDecided(USER)).toBe(true);
  });
});
