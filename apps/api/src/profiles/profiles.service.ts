import { Injectable } from "@nestjs/common";
import type { ProfileResponse, UpdateProfileRequest } from "@readi/shared-types";
import type { CareerLevel, CareerRole, Profile } from "../generated/prisma/client";
import { fieldError } from "../http/api-error";
import { PrismaService } from "../prisma/prisma.service";

const HOUR_MS = 3_600_000;

/** `YYYY-MM-DD` ↔ the UTC-midnight Date Prisma uses for a `date` column. */
const toDate = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);
const fromDate = (date: Date) => date.toISOString().slice(0, 10);

/** The earliest calendar date that is still "today" somewhere on Earth (UTC-12), as YYYY-MM-DD. */
export const earliestLocalDate = (now: Date) => fromDate(new Date(now.getTime() - 12 * HOUR_MS));

/** Keeps the first spelling of each item, comparing without regard to case. */
export function dedupeStack(stack: readonly string[]): string[] {
  const seen = new Set<string>();
  return stack.filter((item) => {
    const key = item.toLocaleLowerCase("en");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<ProfileResponse | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: { ...PROFILE_CATALOGUE, user: { select: { name: true } } },
    });
    return profile ? toResponse(profile, profile.user.name) : null;
  }

  /** Creates or replaces the profile and sets the user's display name, atomically. */
  async upsert(
    userId: string,
    input: UpdateProfileRequest,
    now = new Date(),
  ): Promise<ProfileResponse> {
    // A candidate anywhere may pick their own "today" (YYYY-MM-DD strings compare in date order).
    if (input.target_date && input.target_date < earliestLocalDate(now)) {
      throw fieldError("target_date", "must not be in the past");
    }
    const { roleId, levelId } = await this.resolveTarget(input.target_role, input.level);
    const data = {
      targetRoleId: roleId,
      targetLevelId: levelId,
      yearsExperience: input.years_experience,
      stack: dedupeStack(input.stack),
      targetCompanyType: input.target_company_type,
      targetDate: input.target_date ? toDate(input.target_date) : null,
    };
    const [, profile] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { name: input.name } }),
      this.prisma.profile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
        include: PROFILE_CATALOGUE,
      }),
    ]);
    return toResponse(profile, input.name);
  }

  /**
   * A candidate may only prepare for a role the catalogue actually offers (ADR-0015): published,
   * and at a level that role is hired at. The onboarding form is built from the same query, so
   * reaching either refusal means the request did not come from the form — an old bookmark, a
   * stale tab, or someone trying it by hand.
   *
   * These are **field errors, not coded `ApiError`s**, and deliberately: this is a form, and the
   * answer a form needs is which field to mark (ADR-0012). The CMS is the other case — tagging a
   * question with an unknown role is not one field of a form the user is looking at — so
   * `ContentService` raises `role_not_found` there instead.
   */
  private async resolveTarget(
    roleSlug: string,
    levelSlug: string,
  ): Promise<{ roleId: string; levelId: string }> {
    const role = await this.prisma.careerRole.findFirst({
      where: { slug: roleSlug, status: "published" },
      select: {
        id: true,
        levels: { where: { level: { slug: levelSlug } }, select: { levelId: true } },
      },
    });
    if (!role) throw fieldError("target_role", "no such role");

    const offered = role.levels[0];
    if (!offered) {
      const level = await this.prisma.careerLevel.findFirst({
        where: { slug: levelSlug, status: "published" },
        select: { id: true },
      });
      throw fieldError("level", level ? "that role is not hired at that level" : "no such level");
    }
    return { roleId: role.id, levelId: offered.levelId };
  }
}

/** A profile answers with slugs, so every read of one carries the two catalogue rows. */
export const PROFILE_CATALOGUE = {
  targetRole: { select: { slug: true } },
  targetLevel: { select: { slug: true } },
} as const;

type ProfileWithCatalogue = Profile & {
  targetRole: Pick<CareerRole, "slug">;
  targetLevel: Pick<CareerLevel, "slug">;
};

function toResponse(profile: ProfileWithCatalogue, name: string): ProfileResponse {
  return {
    name,
    target_role: profile.targetRole.slug,
    level: profile.targetLevel.slug,
    years_experience: profile.yearsExperience,
    stack: profile.stack,
    target_company_type: profile.targetCompanyType,
    target_date: profile.targetDate ? fromDate(profile.targetDate) : null,
    updated_at: profile.updatedAt.toISOString(),
  };
}
