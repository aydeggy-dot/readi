import { Injectable } from "@nestjs/common";
import type { ProfileResponse, UpdateProfileRequest } from "@readi/shared-types";
import type { CareerLevel, CareerRole, Profile, Stack } from "../generated/prisma/client";
import { fieldError } from "../http/api-error";
import { PrismaService } from "../prisma/prisma.service";

const HOUR_MS = 3_600_000;

/** `YYYY-MM-DD` ↔ the UTC-midnight Date Prisma uses for a `date` column. */
const toDate = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);
const fromDate = (date: Date) => date.toISOString().slice(0, 10);

/** The earliest calendar date that is still "today" somewhere on Earth (UTC-12), as YYYY-MM-DD. */
export const earliestLocalDate = (now: Date) => fromDate(new Date(now.getTime() - 12 * HOUR_MS));

/** Keeps the first spelling of each item, comparing without regard to case. */
export function dedupeTechnologies(technologies: readonly string[]): string[] {
  const seen = new Set<string>();
  return technologies.filter((item) => {
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
    const { roleId, levelId, stackId } = await this.resolveTarget(input);
    const data = {
      targetRoleId: roleId,
      targetLevelId: levelId,
      targetStackId: stackId,
      yearsExperience: input.years_experience,
      technologies: dedupeTechnologies(input.technologies),
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
   * at a level that role is hired at, and — when they chose one — on a stack variant that role
   * offers. The onboarding form is built from the same query, so reaching any of these refusals
   * means the request did not come from the form — an old bookmark, a stale tab, or someone
   * trying it by hand.
   *
   * These are **field errors, not coded `ApiError`s**, and deliberately: this is a form, and the
   * answer a form needs is which field to mark (ADR-0012). The CMS is the other case — tagging a
   * question with an unknown role is not one field of a form the user is looking at — so
   * `ContentService` raises `role_not_found` there instead.
   */
  private async resolveTarget(
    input: UpdateProfileRequest,
  ): Promise<{ roleId: string; levelId: string; stackId: string | null }> {
    const { target_role: roleSlug, level: levelSlug, target_stack: stackSlug } = input;
    const role = await this.prisma.careerRole.findFirst({
      where: { slug: roleSlug, status: "published" },
      select: {
        id: true,
        levels: { where: { level: { slug: levelSlug } }, select: { levelId: true } },
        // A stack is only offered *by a role*, so it is resolved in the same query, against the
        // same role, and published: "Java / Spring" is not a choice a frontend candidate can
        // make, even though the row exists.
        stacks: stackSlug
          ? {
              where: { stack: { slug: stackSlug, status: "published" } },
              select: { stackId: true },
            }
          : undefined,
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

    /*
     * One message for both ways this can fail — the role does not offer that variant, or the
     * variant is no longer published — because the answer a form needs is the same either way:
     * this choice is not on offer any more, pick again. A retired stack stays on the profiles
     * that already chose it; nobody new may pick one.
     */
    let stackId: string | null = null;
    if (stackSlug) {
      const link = role.stacks?.[0];
      if (!link) throw fieldError("target_stack", "that role does not offer that stack");
      stackId = link.stackId;
    }
    return { roleId: role.id, levelId: offered.levelId, stackId };
  }
}

/** A profile answers with slugs, so every read of one carries its catalogue rows. The stack is
 * the one that may legitimately be absent: not every candidate has chosen a variant. */
export const PROFILE_CATALOGUE = {
  targetRole: { select: { slug: true } },
  targetLevel: { select: { slug: true } },
  targetStack: { select: { slug: true } },
} as const;

type ProfileWithCatalogue = Profile & {
  targetRole: Pick<CareerRole, "slug">;
  targetLevel: Pick<CareerLevel, "slug">;
  targetStack: Pick<Stack, "slug"> | null;
};

function toResponse(profile: ProfileWithCatalogue, name: string): ProfileResponse {
  return {
    name,
    target_role: profile.targetRole.slug,
    level: profile.targetLevel.slug,
    target_stack: profile.targetStack?.slug ?? null,
    years_experience: profile.yearsExperience,
    technologies: profile.technologies,
    target_company_type: profile.targetCompanyType,
    target_date: profile.targetDate ? fromDate(profile.targetDate) : null,
    updated_at: profile.updatedAt.toISOString(),
  };
}
