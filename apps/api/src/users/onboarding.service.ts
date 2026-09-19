import { HttpStatus, Injectable } from "@nestjs/common";
import type { OnboardingState } from "@readi/shared-types";
import { ConsentsService } from "../consents/consents.service";
import { ApiError } from "../http/api-error";
import { PrismaService } from "../prisma/prisma.service";

/** Onboarding (spec §5 flow 1): profile → CV (optional, M1 phase 3) → consent → diagnostic. */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consents: ConsentsService,
  ) {}

  async state(userId: string): Promise<OnboardingState> {
    const [profile, consentsCompleted] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { userId },
        select: { onboardingCompletedAt: true },
      }),
      this.consents.allDecided(userId),
    ]);
    return {
      profile_completed: profile !== null,
      consents_completed: consentsCompleted,
      completed_at: profile?.onboardingCompletedAt?.toISOString() ?? null,
    };
  }

  /** Marks onboarding complete once the required steps are done. Idempotent. */
  async complete(userId: string): Promise<OnboardingState> {
    const current = await this.state(userId);
    if (current.completed_at) return current;
    if (!current.profile_completed) {
      throw new ApiError(HttpStatus.CONFLICT, "profile_required", "complete the profile first");
    }
    if (!current.consents_completed) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        "consents_required",
        "record consent decisions first",
      );
    }
    await this.prisma.profile.updateMany({
      where: { userId, onboardingCompletedAt: null },
      data: { onboardingCompletedAt: new Date() },
    });
    return this.state(userId);
  }
}
