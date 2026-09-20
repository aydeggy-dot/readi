import { Controller, Get } from "@nestjs/common";
import { ApiForbiddenResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { createZodDto, ZodSerializerDto } from "nestjs-zod";
import { z } from "zod";
import { Roles } from "../auth/auth.decorators";
import { PrismaService } from "../prisma/prisma.service";

const AdminStats = z.object({
  users_total: z.int().nonnegative(),
  users_by_role: z.record(z.string(), z.int().nonnegative()),
});
class AdminStatsDto extends createZodDto(AdminStats) {}

@ApiTags("admin")
@Roles("admin")
@Controller("admin")
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  /** User counts by role (admin only). */
  @Get("stats")
  @ZodSerializerDto(AdminStatsDto)
  @ApiOkResponse({ type: AdminStatsDto.Output })
  @ApiForbiddenResponse({ description: "Not an admin" })
  async stats(): Promise<z.infer<typeof AdminStats>> {
    const groups = await this.prisma.user.groupBy({
      by: ["role"],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const byRole = Object.fromEntries(groups.map((g) => [g.role, g._count._all]));
    return {
      users_total: groups.reduce((sum, g) => sum + g._count._all, 0),
      users_by_role: byRole,
    };
  }
}
