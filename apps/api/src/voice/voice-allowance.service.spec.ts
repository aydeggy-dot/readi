import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import { startOfMonth, VoiceAllowanceService } from "./voice-allowance.service";

describe("the allowance period", () => {
  /**
   * A calendar month in UTC. Not the candidate's own month — a candidate who travels would get a
   * longer or a shorter one — and not a rolling thirty days, because "your minutes reset on the 1st"
   * is a sentence anybody can check and a rolling window is not.
   */
  it("is the calendar month, in UTC", () => {
    expect(startOfMonth(new Date("2026-09-30T23:59:59.000Z")).toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
    expect(startOfMonth(new Date("2026-01-01T00:00:00.000Z")).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
});

describe("what is left of an allowance", () => {
  const aggregate = vi.fn<() => Promise<{ _sum: { quantity: number | null } }>>();
  const prisma = { usageLedger: { aggregate } } as unknown as PrismaService;
  const service = (minutes: number) =>
    new VoiceAllowanceService(prisma, { VOICE_ALLOWANCE_MINUTES: minutes } as Env);

  it("reads the ledger rather than a counter, and reports minutes as seconds", async () => {
    aggregate.mockResolvedValue({ _sum: { quantity: 600 } });
    await expect(service(30).forUser("u", new Date("2026-09-15T00:00:00.000Z"))).resolves.toEqual({
      allowanceSeconds: 1_800,
      usedSeconds: 600,
      remainingSeconds: 1_200,
      since: new Date("2026-09-01T00:00:00.000Z"),
    });
  });

  it("treats an empty ledger as nothing used, not as nothing known", async () => {
    aggregate.mockResolvedValue({ _sum: { quantity: null } });
    const allowance = await service(10).forUser("u");
    expect(allowance.usedSeconds).toBe(0);
    expect(allowance.remainingSeconds).toBe(600);
  });

  /**
   * A leg may legitimately overrun the last seconds of an allowance — the agent closes before crossing
   * the line, not to the millisecond — and a negative "remaining" would be arithmetic leaking into a
   * screen.
   */
  it("never reports a negative remainder", async () => {
    aggregate.mockResolvedValue({ _sum: { quantity: 1_000 } });
    expect((await service(10).forUser("u")).remainingSeconds).toBe(0);
  });

  it("asks only for this candidate's voice seconds in this period", async () => {
    aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
    await service(10).forUser("u", new Date("2026-09-15T00:00:00.000Z"));
    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "u",
          kind: "voice_seconds",
          occurredAt: { gte: new Date("2026-09-01T00:00:00.000Z") },
        },
      }),
    );
  });
});
