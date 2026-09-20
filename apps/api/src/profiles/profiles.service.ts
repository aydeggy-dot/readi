import { Injectable } from "@nestjs/common";
import type { ProfileResponse, UpdateProfileRequest } from "@readi/shared-types";
import type { Profile } from "../generated/prisma/client";
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
      include: { user: { select: { name: true } } },
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
    const data = {
      targetRole: input.target_role,
      level: input.level,
      yearsExperience: input.years_experience,
      stack: dedupeStack(input.stack),
      targetCompanyType: input.target_company_type,
      targetDate: input.target_date ? toDate(input.target_date) : null,
    };
    const [, profile] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { name: input.name } }),
      this.prisma.profile.upsert({ where: { userId }, create: { userId, ...data }, update: data }),
    ]);
    return toResponse(profile, input.name);
  }
}

function toResponse(profile: Profile, name: string): ProfileResponse {
  return {
    name,
    target_role: profile.targetRole,
    level: profile.level,
    years_experience: profile.yearsExperience,
    stack: profile.stack,
    target_company_type: profile.targetCompanyType,
    target_date: profile.targetDate ? fromDate(profile.targetDate) : null,
    updated_at: profile.updatedAt.toISOString(),
  };
}
